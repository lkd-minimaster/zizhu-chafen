'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core.js')();

const ctx = { homeworkId: 'homework', courseId: 'course', term: '20271' };

function makeDetail(extra = {}) {
  return {
    ...ctx,
    studentId: 'self',
    type: 'question',
    status: 'unReview',
    isPublish: 0,
    score: 100,
    absScore: 100,
    submitTime: '2026-10-21 19:11:47',
    homeworkName: '课外作业-第4章-程序的控制结构',
    selectQuestionVO: {
      paperId: 'paper',
      examId: 'exam',
      studentAnswerExamId: 'exam',
      examQuestionTypeStatistics: { questionNum: 2 },
    },
    ...extra,
  };
}

const rows = (a = 40, b = 60) => [a, b].map((score, index) => ({
  homeworkId: 'homework',
  paperId: 'paper',
  examId: 'exam',
  userId: 'self',
  questionId: 'q' + index,
  orderNo: String(index + 1),
  answerScore: score,
  child: [],
}));

function harness(details, answers, options = {}) {
  let detailIndex = 0;
  let answerIndex = 0;
  let clock = 0;
  const updates = [];
  return {
    updates,
    get answerCalls() { return answerIndex; },
    run: () => core.collect({
      ctx,
      loadDetail: async () => details[Math.min(detailIndex++, details.length - 1)],
      loadAnswers: async () => answers[Math.min(answerIndex++, answers.length - 1)],
      now: () => clock,
      sleep: async (ms) => { clock += ms; },
      update: (...args) => updates.push(args[0]),
      ...options,
    }),
  };
}

test('从真实路径形状提取参数，拒绝其他域名、非作业页、缺少学期和小组作业', () => {
  const url = 'https://aic.sysu.edu.cn/aic/exam-hub/course/stu/homework/detail/homework?termId=20271';
  assert.deepEqual(core.context(url), ctx);
  for (const bad of [
    url.replace('aic.sysu.edu.cn', 'evil.example'),
    url.split('?')[0],
    url + '&groupId=team',
    'https://aic.sysu.edu.cn/',
  ]) {
    assert.throws(() => core.context(bad), (error) => error.code === 'page' || error.code === 'unsupported');
  }
});

test('小数与零分有效；null、空串、布尔、负数和非有限值都当作“没写好”', () => {
  assert.equal(core.number('98.5'), 98.5);
  assert.equal(core.number(0), 0);
  assert.equal(core.number('0.5'), 0.5);
  for (const value of [null, undefined, '', ' ', true, false, -1, Infinity, NaN, 'NaN', '1e3', {}, []]) {
    assert.equal(core.number(value), null);
  }
  const params = core.validateDetail(makeDetail(), ctx);
  assert.equal(core.summarize(rows(0.1, 0.2), params).total, 0.3);
  assert.equal(core.summarize(rows(0, 60), params).total, 60);
  assert.equal(core.summarize(rows(null, 60), params), null);
});

test('作业详情必须与当前页面一致，并识别已发布、未知状态与非题目作业', () => {
  const params = core.validateDetail(makeDetail(), ctx);
  assert.equal(params.count, 2);
  assert.equal(params.max, 100);
  assert.throws(() => core.validateDetail(makeDetail({ isPublish: 1 }), ctx), (e) => e.code === 'published');
  assert.throws(() => core.validateDetail(makeDetail({ status: 'editing' }), ctx), (e) => e.code === 'status');
  assert.throws(() => core.validateDetail(makeDetail({ type: 'file' }), ctx), (e) => e.code === 'unsupported');
  assert.throws(() => core.validateDetail(makeDetail({ courseId: 'other' }), ctx), (e) => e.code === 'scope');
});

test('阻止其他账号、试卷、作业、重复题目和超出满分的数据', () => {
  const params = core.validateDetail(makeDetail(), ctx);
  for (const change of [
    { userId: 'other' },
    { paperId: 'other' },
    { examId: 'other' },
    { homeworkId: 'other' },
    { questionId: 'q1' },
    { orderNo: '2' },
  ]) {
    const data = rows();
    Object.assign(data[0], change);
    assert.throws(() => core.summarize(data, params), (e) => e.code === 'scope' || e.code === 'format');
  }
  assert.throws(() => core.summarize(rows(41, 60), params), (e) => e.code === 'invalid');
  assert.equal(core.summarize(rows().slice(0, 1), params), null);
});

test('只累加顶层 answerScore，避免重复计算子题', () => {
  const data = rows();
  data[0].child = [{ answerScore: 40, child: [{ answerScore: 40 }] }];
  assert.equal(core.summarize(data, core.validateDetail(makeDetail(), ctx)).total, 100);
});

test('逐题得分按题号顺序返回，供诊断信息展示', () => {
  const params = core.validateDetail(makeDetail(), ctx);
  const result = core.summarize([...rows(3, 97)].reverse(), params);
  assert.deepEqual(result.breakdown, [{ order: '1', score: 3 }, { order: '2', score: 97 }]);
  assert.equal(result.total, 100);
});

test('稳定结果需要两轮一致，不会展示第一轮', async () => {
  const h = harness([makeDetail()], [rows()]);
  const result = await h.run();
  assert.equal(result.total, 100);
  assert.equal(result.breakdown.length, 2);
  assert.equal(h.answerCalls, 2);
  assert.equal(result.readAt, 1500);
});

test('97 → null → 100：中间值不会闪出来，最终只返回 100', async () => {
  const half = makeDetail({ absScore: null });
  const h = harness(
    [makeDetail({ status: 'aiReview' }), makeDetail({ absScore: 97 }), makeDetail({ absScore: 97 }),
      half, half, makeDetail(), makeDetail()],
    [rows(37, 60), rows(null, 60), rows()],
  );
  const result = await h.run();
  assert.equal(result.total, 100);
  assert.equal(h.answerCalls, 4);
  assert.equal(h.updates[0].phase, 'aiReview');
  assert.ok(!h.updates.some((update) => update.phase === 'verifying' && update.params === undefined));
});

test('两次总分相同但逐题得分有变化，仍要再确认一轮', async () => {
  const h = harness([makeDetail()], [rows(), rows(39, 61), rows()]);
  const result = await h.run();
  assert.equal(result.total, 100);
  assert.equal(h.answerCalls, 4);
});

test('读取成绩后状态回退 aiReview，本轮作废', async () => {
  const h = harness([makeDetail(), makeDetail({ status: 'aiReview' }), makeDetail()], [rows()]);
  const result = await h.run();
  assert.equal(result.total, 100);
  assert.equal(h.answerCalls, 3);
});

test('重新提交改变提交时间时丢弃旧结果', async () => {
  const h = harness([makeDetail(), makeDetail({ submitTime: '2026-10-22 09:00:00' })], [rows()]);
  const result = await h.run();
  assert.equal(result.total, 100);
  assert.equal(h.answerCalls, 3);
});

test('总分对不上、题目缺失或持续 aiReview 会超时，不显示中间值', async () => {
  for (const h of [
    harness([makeDetail({ absScore: 97 })], [rows()], { timeoutMs: 6000 }),
    harness([makeDetail()], [rows().slice(0, 1)], { timeoutMs: 6000 }),
    harness([makeDetail({ status: 'aiReview' })], [], { timeoutMs: 6000 }),
  ]) {
    await assert.rejects(h.run(), (error) => error.code === 'timeout');
  }
});

test('已发布、未知状态、不匹配的作业和网络错误直接停止', async () => {
  for (const detail of [makeDetail({ isPublish: 1 }), makeDetail({ status: 'editing' }), makeDetail({ courseId: 'other' })]) {
    const h = harness([detail], [rows()]);
    await assert.rejects(h.run(), (error) => ['published', 'status', 'scope'].includes(error.code));
    assert.equal(h.answerCalls, 0);
  }
  await assert.rejects(
    harness([], [], { loadDetail: async () => { throw new Error('HTTP 403'); } }).run(),
    /403/,
  );
});

test('取消会立刻终止轮询', async () => {
  let aborted = false;
  const h = harness([makeDetail()], [rows()], {
    sleep: async () => { aborted = true; },
    check: () => { if (aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); },
  });
  await assert.rejects(h.run(), /cancelled/);
  assert.equal(h.answerCalls, 1);
});

test('等待节奏先密后疏，最终封顶 15 秒', () => {
  assert.equal(core.delayFor(1), 1500);
  assert.equal(core.delayFor(4), 3000);
  assert.equal(core.delayFor(99), 15000);
});
