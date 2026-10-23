'use strict';

/**
 * 自助查分 · 纯逻辑层
 * 不接触 DOM、网络与登录态，只负责：解析页面参数、校验作业、汇总逐题得分、等待稳定结果。
 * 这样可以在 Node 里用固定时钟完整测试“97 → null → 100”这类时序。
 */
function createCore() {
  class GradeError extends Error {
    constructor(message, code = 'invalid') {
      super(message);
      this.name = 'GradeError';
      this.code = code;
    }
  }
  const fail = (message, code) => { throw new GradeError(message, code); };

  /** 只接受非负的有限数字；空串、null、布尔、负数都视为“还没写好”。 */
  function number(value) {
    if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
    if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)) {
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? n : null;
    }
    return null;
  }

  const same = (a, b) => a != null && b != null && String(a) === String(b);

  /**
   * 从地址栏取出 courseId / homeworkId / term。
   * 只接受 aic.sysu.edu.cn 的作业详情页，避免在别的页面误发请求。
   */
  function context(href) {
    let u;
    try { u = new URL(href); } catch { fail('当前页面地址无法识别。', 'page'); }
    const m = u.pathname.match(/^\/aic\/exam-hub\/([^/]+)\/stu\/homework\/detail\/([^/]+)\/?$/);
    if (u.origin !== 'https://aic.sysu.edu.cn' || !m || !u.searchParams.get('termId')) {
      fail('请先打开逸仙智课的作业详情页，再点击书签。', 'page');
    }
    if (u.searchParams.get('groupId')) fail('当前版本只支持个人作业，不支持小组作业。', 'unsupported');
    return {
      courseId: decodeURIComponent(m[1]),
      homeworkId: decodeURIComponent(m[2]),
      term: u.searchParams.get('termId'),
    };
  }

  /**
   * 校验作业详情，并抽出查询所需参数。
   * 任何与当前页面不一致的返回都会直接中止，避免串号。
   */
  function validateDetail(detail, ctx) {
    if (!detail || typeof detail !== 'object') fail('作业详情接口没有返回数据。', 'format');
    if (!same(detail.homeworkId, ctx.homeworkId) || !same(detail.courseId, ctx.courseId) || !same(detail.term, ctx.term)) {
      fail('返回的作业与当前页面不一致，已停止查询。', 'scope');
    }
    if (Number(detail.isPublish) === 1) {
      fail('这次作业的成绩已经正式发布，直接看平台页面即可。', 'published');
    }
    if (detail.status !== 'unReview' && detail.status !== 'aiReview') {
      fail('当前作业不在“提交后待批阅”的状态，暂不读取卷面分。', 'status');
    }
    const q = detail.selectQuestionVO;
    if (detail.type !== 'question' || !detail.studentId || !q || !q.paperId ||
        !(q.studentAnswerExamId || q.examId)) {
      fail('当前作业类型或参数不受支持。', 'unsupported');
    }
    const count = number(q.examQuestionTypeStatistics && q.examQuestionTypeStatistics.questionNum);
    const max = number(detail.score);
    if (!count || !Number.isInteger(count) || max === null) {
      fail('未获取到完整的题目数量或满分信息。', 'format');
    }
    return {
      homeworkId: detail.homeworkId,
      paperId: q.paperId,
      examId: q.studentAnswerExamId || q.examId,
      courseId: detail.courseId,
      term: detail.term,
      studentId: detail.studentId,
      count,
      max,
      title: String(detail.homeworkName || '当前作业'),
      submitTime: detail.submitTime,
    };
  }

  function identity(params) {
    return JSON.stringify([params.homeworkId, params.paperId, params.examId, params.courseId,
      params.term, params.studentId, params.count, params.max, params.submitTime]);
  }

  /**
   * 汇总逐题得分。
   * - 记录数必须等于题数；少一条就返回 null，表示还在写入。
   * - 顶层 answerScore 已包含子题得分，不能再累加 child。
   * - 出现重复题号、错账号、超满分都视为异常并中止。
   */
  function summarize(rows, params) {
    if (!Array.isArray(rows)) fail('成绩接口返回的格式发生了变化。', 'format');
    if (rows.length !== params.count) return null;
    const ids = new Set();
    const orders = new Set();
    const scores = [];
    for (const row of rows) {
      if (!row || !same(row.homeworkId, params.homeworkId) || !same(row.paperId, params.paperId) ||
          !same(row.examId, params.examId) || !same(row.userId, params.studentId)) {
        fail('成绩记录与当前学生或试卷不一致，已停止查询。', 'scope');
      }
      const order = String(row.orderNo == null ? '' : row.orderNo);
      if (!row.questionId || !order || ids.has(String(row.questionId)) || orders.has(order)) {
        fail('成绩记录存在重复题目或缺少题号，已停止汇总。', 'format');
      }
      ids.add(String(row.questionId));
      orders.add(order);
      const score = number(row.answerScore);
      if (score === null) return null;
      scores.push({ id: String(row.questionId), order, score });
    }
    // 排序只为得到稳定的指纹，不影响求和。
    scores.sort((a, b) => a.id.localeCompare(b.id));
    const total = Math.round(scores.reduce((sum, row) => sum + row.score, 0) * 1e6) / 1e6;
    if (total > params.max) fail('卷面分超过满分，已停止展示，请以平台结果为准。', 'invalid');
    // 展示用：按题号顺序，而不是按 questionId 排序。
    const breakdown = [...scores]
      .sort((a, b) => (Number(a.order) - Number(b.order)) || a.id.localeCompare(b.id))
      .map((row) => ({ order: row.order, score: row.score }));
    return { total, count: rows.length, max: params.max, fingerprint: JSON.stringify(scores), breakdown };
  }

  // 等待节奏：先密后疏，既能在十几秒内出结果，也能安静地等 AI 批阅几分钟。
  const DELAYS = [1500, 2000, 3000, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000];
  const delayFor = (attempt) => DELAYS[Math.min(attempt - 1, DELAYS.length - 1)];

  /**
   * 轮询到“稳定”为止：
   * 同一份提交、unReview、逐题分数完整、总分对得上，且连续两轮完全一致，才返回。
   * 中途任何一次状态回退、重新提交或数据缺失都会清空已确认值。
   */
  async function collect(options) {
    const {
      ctx, loadDetail, loadAnswers, update = () => {}, sleep, check = () => {},
      now = Date.now, timeoutMs = 15 * 60 * 1000, maxAttempts = 200,
    } = options;
    const start = now();
    let confirmed = null;
    let attempt = 0;
    const alive = () => {
      check();
      if (now() - start >= timeoutMs) {
        fail('等待超时。AI 批阅可能还没结束，可以稍后回来重新读取。', 'timeout');
      }
    };
    while (attempt < maxAttempts) {
      alive();
      attempt += 1;
      const before = await loadDetail(); alive();
      const params = validateDetail(before, ctx);

      if (before.status === 'aiReview') {
        confirmed = null;
        update({ phase: 'aiReview', params, attempt, elapsed: now() - start });
      } else {
        update({ phase: 'checking', params, attempt, elapsed: now() - start });
        const rows = await loadAnswers(params); alive();
        const after = await loadDetail(); alive();
        const later = validateDetail(after, ctx);

        if (after.status !== 'unReview' || identity(params) !== identity(later)) {
          confirmed = null;
          update({ phase: 'changing', params, attempt, elapsed: now() - start });
        } else {
          const summary = summarize(rows, params);
          const abs = number(after.absScore);
          if (!summary) {
            confirmed = null;
            update({ phase: 'incomplete', params, attempt, elapsed: now() - start });
          } else if (abs !== null && Math.abs(abs - summary.total) > 1e-6) {
            confirmed = null;
            update({ phase: 'incomplete', params, attempt, elapsed: now() - start });
          } else {
            const fingerprint = identity(later) + '|' + summary.fingerprint;
            if (confirmed === fingerprint) {
              return {
                total: summary.total,
                count: summary.count,
                max: summary.max,
                breakdown: summary.breakdown,
                title: params.title,
                submitTime: params.submitTime,
                readAt: now(),
                attempts: attempt,
              };
            }
            confirmed = fingerprint;
            update({ phase: 'verifying', params, attempt, elapsed: now() - start });
          }
        }
      }
      await sleep(delayFor(attempt));
    }
    fail('读取次数已达上限，仍未得到稳定结果。请稍后重试。', 'timeout');
  }

  return { GradeError, number, context, validateDetail, summarize, collect, delayFor };
}

if (typeof module !== 'undefined' && module.exports) module.exports = createCore;
