import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { writeAuditEvent } from '@ngois/audit';
import { baseServiceSchema, loadConfig } from '@ngois/config';
import { createPool } from '@ngois/db';
import { notFound, validationError } from '@ngois/errors';
import {
  createApp,
  errorHandler,
  listen,
  ok,
  requirePermission,
  validateBody,
} from '@ngois/service-kit';
import { requireTenantId, withTenant } from '@ngois/tenant-context';

const config = loadConfig(
  baseServiceSchema.extend({
    SERVICE_NAME: z.string().default('lms-service'),
    PORT: z.coerce.number().default(3003),
  }),
);

const pool = createPool(config.DATABASE_URL);
const { app, log } = createApp({ serviceName: config.SERVICE_NAME });

const createCourseSchema = z.object({
  code: z.string().min(2).max(40),
  title: z.string().min(2).max(300),
  category: z.string().max(60).optional(),
  description: z.string().optional(),
  lesson_title: z.string().default('Introduction'),
  assessment_title: z.string().default('Knowledge check'),
});

const ruleSchema = z.object({
  course_id: z.string().uuid(),
  applies_to_type: z.enum([
    'all_staff',
    'department',
    'position',
    'employment_type',
    'duty_station',
  ]),
  applies_to_value: z.string().max(60).optional(),
  due_days_after_hire: z.number().int().positive().default(30),
});

const enrollSchema = z.object({
  employee_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  course_version_id: z.string().uuid(),
  is_mandatory: z.boolean().default(false),
  due_date: z.string().optional(),
});

const onboardSchema = z.object({
  employee_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  position: z.string().optional(),
  department: z.string().optional(),
  employment_type: z.string().optional(),
});

const progressSchema = z.object({
  lesson_id: z.string().uuid(),
  time_spent_seconds: z.number().int().min(0).default(0),
});

const attemptSchema = z.object({
  enrollment_id: z.string().uuid(),
  answers: z.array(
    z.object({
      question_id: z.string().uuid(),
      option_id: z.string().uuid(),
    }),
  ),
});

app.post(
  '/v1/lms/courses',
  requirePermission('lms:course:create'),
  validateBody(createCourseSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof createCourseSchema>;
      const row = await withTenant(pool, tenantId, async (client) => {
        const courseId = randomUUID();
        const versionId = randomUUID();
        const moduleId = randomUUID();
        const lessonId = randomUUID();
        const assessmentId = randomUUID();
        await client.query(
          `INSERT INTO courses (id, tenant_id, code, title, category)
           VALUES ($1,$2,$3,$4,$5)`,
          [courseId, tenantId, body.code, body.title, body.category ?? null],
        );
        await client.query(
          `INSERT INTO course_versions (
             id, tenant_id, course_id, version_number, title, description, is_published
           ) VALUES ($1,$2,$3,1,$4,$5,false)`,
          [versionId, tenantId, courseId, body.title, body.description ?? null],
        );
        await client.query(
          `UPDATE courses SET current_version_id = $1 WHERE id = $2`,
          [versionId, courseId],
        );
        await client.query(
          `INSERT INTO modules (id, tenant_id, course_version_id, title, display_order)
           VALUES ($1,$2,$3,'Module 1',1)`,
          [moduleId, tenantId, versionId],
        );
        await client.query(
          `INSERT INTO lessons (id, tenant_id, module_id, title, content_type, content_body, display_order)
           VALUES ($1,$2,$3,$4,'text',$5,1)`,
          [
            lessonId,
            tenantId,
            moduleId,
            body.lesson_title,
            'Complete this lesson to proceed.',
          ],
        );
        await client.query(
          `INSERT INTO assessments (
             id, tenant_id, course_version_id, title, pass_threshold_percent, max_attempts
           ) VALUES ($1,$2,$3,$4,80,3)`,
          [assessmentId, tenantId, versionId, body.assessment_title],
        );
        const qId = randomUUID();
        await client.query(
          `INSERT INTO questions (id, tenant_id, assessment_id, question_text, question_type, display_order)
           VALUES ($1,$2,$3,'Safeguarding reports must be escalated promptly.','true_false',1)`,
          [qId, tenantId, assessmentId],
        );
        const optTrue = randomUUID();
        const optFalse = randomUUID();
        await client.query(
          `INSERT INTO answer_options (id, tenant_id, question_id, option_text, is_correct, display_order)
           VALUES ($1,$2,$3,'True',true,1), ($4,$2,$3,'False',false,2)`,
          [optTrue, tenantId, qId, optFalse],
        );
        await writeAuditEvent(client, {
          tenantId,
          serviceName: config.SERVICE_NAME,
          action: 'lms.course.created',
          resourceType: 'course',
          resourceId: courseId,
          actorUserId: req.ctx.userId,
          actorRole: req.ctx.role,
          correlationId: req.ctx.correlationId,
        });
        return {
          id: courseId,
          course_version_id: versionId,
          lesson_id: lessonId,
          assessment_id: assessmentId,
          correct_option_id: optTrue,
        };
      });
      ok(res, req, row, 201);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/lms/courses/:id/publish',
  requirePermission('lms:course:publish'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const courseId = req.params.id;
      const row = await withTenant(pool, tenantId, async (client) => {
        const cur = await client.query(
          `SELECT current_version_id FROM courses WHERE id = $1 AND NOT is_deleted`,
          [courseId],
        );
        if (!cur.rows[0]?.current_version_id) throw notFound('course');
        const versionId = cur.rows[0].current_version_id as string;
        await client.query(
          `UPDATE course_versions
           SET is_published = true, published_at = now()
           WHERE id = $1`,
          [versionId],
        );
        await writeAuditEvent(client, {
          tenantId,
          serviceName: config.SERVICE_NAME,
          action: 'lms.course.published',
          resourceType: 'course_version',
          resourceId: versionId,
          actorUserId: req.ctx.userId,
          actorRole: req.ctx.role,
          correlationId: req.ctx.correlationId,
        });
        return { course_id: courseId, course_version_id: versionId, published: true };
      });
      ok(res, req, row);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/lms/mandatory-rules',
  requirePermission('lms:mandatory_rule:admin'),
  validateBody(ruleSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof ruleSchema>;
      const row = await withTenant(pool, tenantId, async (client) => {
        const id = randomUUID();
        await client.query(
          `INSERT INTO mandatory_training_rules (
             id, tenant_id, course_id, applies_to_type, applies_to_value, due_days_after_hire
           ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            id,
            tenantId,
            body.course_id,
            body.applies_to_type,
            body.applies_to_value ?? null,
            body.due_days_after_hire,
          ],
        );
        return { id };
      });
      ok(res, req, row, 201);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/lms/enrollments',
  requirePermission('lms:enrollment:create'),
  validateBody(enrollSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof enrollSchema>;
      const row = await withTenant(pool, tenantId, async (client) => {
        const ver = await client.query(
          `SELECT id FROM course_versions WHERE id = $1 AND is_published`,
          [body.course_version_id],
        );
        if (!ver.rows[0]) throw validationError('course version not published', 'course_version_id');
        const id = randomUUID();
        await client.query(
          `INSERT INTO lms_enrollments (
             id, tenant_id, employee_id, user_id, course_version_id, source, is_mandatory, due_date
           ) VALUES ($1,$2,$3,$4,$5,'manual',$6,$7)
           ON CONFLICT (employee_id, course_version_id) DO NOTHING`,
          [
            id,
            tenantId,
            body.employee_id,
            body.user_id ?? req.ctx.userId ?? null,
            body.course_version_id,
            body.is_mandatory,
            body.due_date ?? null,
          ],
        );
        const existing = await client.query(
          `SELECT id, status FROM lms_enrollments
           WHERE employee_id = $1 AND course_version_id = $2`,
          [body.employee_id, body.course_version_id],
        );
        return existing.rows[0];
      });
      ok(res, req, row, 201);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/lms/hr/onboarded',
  requirePermission('lms:enrollment:create'),
  validateBody(onboardSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof onboardSchema>;
      const created = await withTenant(pool, tenantId, async (client) => {
        const rules = await client.query(
          `SELECT r.*, c.current_version_id
           FROM mandatory_training_rules r
           JOIN courses c ON c.id = r.course_id
           WHERE r.is_active
             AND (
               r.applies_to_type = 'all_staff'
               OR (r.applies_to_type = 'position' AND r.applies_to_value = $1)
               OR (r.applies_to_type = 'department' AND r.applies_to_value = $2)
               OR (r.applies_to_type = 'employment_type' AND r.applies_to_value = $3)
             )`,
          [body.position ?? null, body.department ?? null, body.employment_type ?? null],
        );
        const enrollments: Array<{ id: string; course_version_id: string }> = [];
        for (const rule of rules.rows) {
          if (!rule.current_version_id) continue;
          const pub = await client.query(
            `SELECT id FROM course_versions WHERE id = $1 AND is_published`,
            [rule.current_version_id],
          );
          if (!pub.rows[0]) continue;
          const id = randomUUID();
          const due = new Date();
          due.setDate(due.getDate() + Number(rule.due_days_after_hire ?? 30));
          await client.query(
            `INSERT INTO lms_enrollments (
               id, tenant_id, employee_id, user_id, course_version_id, source,
               mandatory_rule_id, is_mandatory, due_date
             ) VALUES ($1,$2,$3,$4,$5,'mandatory_rule',$6,true,$7)
             ON CONFLICT (employee_id, course_version_id) DO NOTHING`,
            [
              id,
              tenantId,
              body.employee_id,
              body.user_id ?? null,
              rule.current_version_id,
              rule.id,
              due.toISOString().slice(0, 10),
            ],
          );
          const row = await client.query(
            `SELECT id, course_version_id FROM lms_enrollments
             WHERE employee_id = $1 AND course_version_id = $2`,
            [body.employee_id, rule.current_version_id],
          );
          if (row.rows[0]) enrollments.push(row.rows[0]);
        }
        return { enrollments };
      });
      ok(res, req, created, 201);
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  '/v1/lms/my-enrollments',
  requirePermission('lms:enrollment:read_own', 'lms:enrollment:read'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const rows = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT e.id, e.status, e.due_date, e.is_mandatory, e.course_version_id,
                  cv.title, cv.version_number, c.code
           FROM lms_enrollments e
           JOIN course_versions cv ON cv.id = e.course_version_id
           JOIN courses c ON c.id = cv.course_id
           WHERE NOT e.is_deleted
             AND (e.user_id = $1 OR e.employee_id = $1)
           ORDER BY e.created_at DESC`,
          [req.ctx.userId],
        );
        return r.rows;
      });
      ok(res, req, rows);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/lms/enrollments/:id/progress',
  requirePermission('lms:progress:record_own'),
  validateBody(progressSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const enrollmentId = req.params.id;
      const body = req.body as z.infer<typeof progressSchema>;
      const row = await withTenant(pool, tenantId, async (client) => {
        const en = await client.query(
          `SELECT id, status FROM lms_enrollments WHERE id = $1 AND NOT is_deleted`,
          [enrollmentId],
        );
        if (!en.rows[0]) throw notFound('enrollment');
        await client.query(
          `INSERT INTO lesson_progress (tenant_id, enrollment_id, lesson_id, completed_at, time_spent_seconds)
           VALUES ($1,$2,$3,now(),$4)
           ON CONFLICT (enrollment_id, lesson_id) DO UPDATE
             SET completed_at = COALESCE(lesson_progress.completed_at, now()),
                 time_spent_seconds = lesson_progress.time_spent_seconds + EXCLUDED.time_spent_seconds`,
          [tenantId, enrollmentId, body.lesson_id, body.time_spent_seconds],
        );
        if (en.rows[0].status === 'assigned') {
          await client.query(
            `UPDATE lms_enrollments SET status = 'in_progress', started_at = now(), updated_at = now()
             WHERE id = $1`,
            [enrollmentId],
          );
        }
        return { enrollment_id: enrollmentId, lesson_id: body.lesson_id, completed: true };
      });
      ok(res, req, row);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/lms/assessments/:id/attempts',
  requirePermission('lms:assessment:attempt'),
  validateBody(attemptSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const assessmentId = req.params.id;
      const body = req.body as z.infer<typeof attemptSchema>;
      const result = await withTenant(pool, tenantId, async (client) => {
        const a = await client.query(
          `SELECT * FROM assessments WHERE id = $1`,
          [assessmentId],
        );
        if (!a.rows[0]) throw notFound('assessment');
        const assessment = a.rows[0];
        const prior = await client.query(
          `SELECT coalesce(max(attempt_number),0)::int AS n FROM assessment_attempts
           WHERE enrollment_id = $1 AND assessment_id = $2`,
          [body.enrollment_id, assessmentId],
        );
        const attemptNumber = Number(prior.rows[0]?.n ?? 0) + 1;
        if (attemptNumber > Number(assessment.max_attempts ?? 3)) {
          throw validationError('max attempts exceeded', 'attempts');
        }
        const opts = await client.query(
          `SELECT ao.id, ao.is_correct, q.points, q.id AS question_id
           FROM answer_options ao
           JOIN questions q ON q.id = ao.question_id
           WHERE q.assessment_id = $1`,
          [assessmentId],
        );
        let earned = 0;
        let possible = 0;
        const byQ = new Map<string, { points: number; correctIds: Set<string> }>();
        for (const o of opts.rows) {
          const q = byQ.get(o.question_id) ?? {
            points: Number(o.points),
            correctIds: new Set<string>(),
          };
          q.points = Number(o.points);
          if (o.is_correct) q.correctIds.add(o.id);
          byQ.set(o.question_id, q);
        }
        for (const q of byQ.values()) possible += q.points;
        for (const ans of body.answers) {
          const q = byQ.get(ans.question_id);
          if (q?.correctIds.has(ans.option_id)) earned += q.points;
        }
        const score = possible === 0 ? 0 : Math.round((earned / possible) * 100);
        const passed = score >= Number(assessment.pass_threshold_percent ?? 80);
        const attemptId = randomUUID();
        await client.query(
          `INSERT INTO assessment_attempts (
             id, tenant_id, enrollment_id, assessment_id, attempt_number,
             submitted_at, score_percent, passed, responses
           ) VALUES ($1,$2,$3,$4,$5,now(),$6,$7,$8::jsonb)`,
          [
            attemptId,
            tenantId,
            body.enrollment_id,
            assessmentId,
            attemptNumber,
            score,
            passed,
            JSON.stringify(body.answers),
          ],
        );
        await client.query(
          `UPDATE lms_enrollments SET attempts_used = $2, updated_at = now() WHERE id = $1`,
          [body.enrollment_id, attemptNumber],
        );
        let certificate = null;
        if (passed) {
          const en = await client.query(
            `SELECT e.*, cv.title, cv.version_number
             FROM lms_enrollments e
             JOIN course_versions cv ON cv.id = e.course_version_id
             WHERE e.id = $1`,
            [body.enrollment_id],
          );
          const enrollment = en.rows[0];
          await client.query(
            `UPDATE lms_enrollments
             SET status = 'completed', completed_at = now(), final_score = $2, updated_at = now()
             WHERE id = $1`,
            [body.enrollment_id, score],
          );
          const certId = randomUUID();
          const certNo = `CERT-${new Date().getFullYear()}-${String(attemptNumber).padStart(5, '0')}-${certId.slice(0, 8)}`;
          const hash = createHash('sha256')
            .update(`${certNo}:${enrollment.employee_id}:${enrollment.title}`)
            .digest('hex');
          await client.query(
            `INSERT INTO certificates (
               id, tenant_id, enrollment_id, employee_id, certificate_number,
               course_title, course_version_number, issued_date, verification_hash
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE,$8)`,
            [
              certId,
              tenantId,
              body.enrollment_id,
              enrollment.employee_id,
              certNo,
              enrollment.title,
              enrollment.version_number,
              hash,
            ],
          );
          certificate = { id: certId, certificate_number: certNo, verification_hash: hash };
        }
        return { attempt_id: attemptId, score_percent: score, passed, certificate };
      });
      ok(res, req, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  '/v1/lms/compliance-status',
  requirePermission('lms:compliance:read'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const row = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT
             count(*) FILTER (WHERE is_mandatory)::int AS mandatory_total,
             count(*) FILTER (WHERE is_mandatory AND status = 'completed')::int AS mandatory_completed,
             count(*) FILTER (WHERE is_mandatory AND status IN ('assigned','in_progress') AND due_date < CURRENT_DATE)::int AS mandatory_overdue
           FROM lms_enrollments WHERE NOT is_deleted`,
        );
        return r.rows[0];
      });
      ok(res, req, row);
    } catch (err) {
      next(err);
    }
  },
);

app.get('/v1/lms/courses', requirePermission('lms:course:read'), async (req, res, next) => {
  try {
    const tenantId = requireTenantId(req.ctx.tenantId);
    const rows = await withTenant(pool, tenantId, async (client) => {
      const r = await client.query(
        `SELECT c.id, c.code, c.title, c.current_version_id, cv.is_published, cv.version_number
         FROM courses c
         LEFT JOIN course_versions cv ON cv.id = c.current_version_id
         WHERE NOT c.is_deleted ORDER BY c.code`,
      );
      return r.rows;
    });
    ok(res, req, rows);
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler(log));
await listen(app, config.PORT, log);
