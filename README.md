# 自助查分 · Score Peek

逸仙智课（aic.sysu.edu.cn）个人作业的**临时卷面分**书签工具。课外作业提交后页面只显示“成绩待发布”，这个小书签会在作业详情页里读取系统已经算好的逐题得分，等 AI 批阅稳定后显示一个带读取时间的临时总分；展开卡片底部的「诊断信息 · 每题得分」，还能看到 1–20 题各得了几分。

纯前端、同源查询、无后端、无第三方依赖、不保存任何数据。

```
交完作业 → 点收藏夹 → 等 AI 批阅稳定 → 看临时卷面分 → 关掉
```

## 交付

分享给同学时发 [Release](https://github.com/lkd-minimaster/zizhu-chafen/releases/latest) 里的 `zizhu-chafen-v2.1.0.zip`（本地构建产物名 `自助查分-v2.1.0.zip`）。解压后**只有 4 个文件，按编号来**：

```
自助查分/
├── 1-先看这里-安装图解.pdf        ← 先看这个（3 页，手把手）
├── 2-安装书签.html                ← 再双击这个，把按钮拖进收藏夹栏
├── 3-拖不动时-导入收藏夹.html      ← 拖不动时用
└── 4-手动安装-书签地址.txt         ← 手动新建收藏项时粘贴
```

仓库的 `dist/` 里另外保留 `使用说明.html`（选读的详细文字版）和 `自助查分.js`（可审计的完整脚本），不放进给同学的发包。

## 安装

1. 解压 zip。
2. 双击 `2-安装书签.html`（用 Edge 打开）。
3. 按 `Ctrl + Shift + B` 显示收藏夹栏。
4. **按住**绿色「自助查分」按钮，拖到收藏夹栏空白处，**再松手**。
5. 打开已提交的作业详情页，点收藏夹里的「自助查分」。

拖不动就用 `3-拖不动时-导入收藏夹.html`：Edge 收藏夹菜单 → 导入收藏夹 → 从文件导入。

## 它怎么工作

### 1. 参数：全部来自当前页面

- `courseId`、`homeworkId` 来自地址栏路径 `/aic/exam-hub/<courseId>/stu/homework/detail/<homeworkId>`
- `term` 来自 `?termId=`
- `paperId`、`examId`、`studentId`、题数、满分、`submitTime` 来自 `getStudentHomeworkDetail` 的返回

没有任何写死的个人 ID。返回的 `homeworkId / courseId / term` 会和地址栏逐项比对，不一致就停止。

### 2. 认证：优先读现成登录态，最后才旁听请求

JWT 在请求头 `Authorization` 里：`jt-cas` Cookie 中是一个 366 字符、`eyJ...` 开头的 JWT。工具按以下顺序取，取到即用：

1. 页面存储（`localStorage` / `sessionStorage` 里形如 JWT 的 token）
2. Cookie（`jt-cas`、`ai-poly`、`openapi-token`、`cloudapi-token`）
3. 兜底：同时包住 `XMLHttpRequest` 和 `fetch`，只观察同源请求的 `Authorization`，拿到后立刻还原，并温和地触发一次 `focus` / `visibilitychange`，最多等 30 秒

不会为了拿令牌去点答题框、改答案或触发保存。令牌只存在闭包变量里，关闭面板即丢弃，不显示、不复制、不写入存储。

### 3. 时序：等到“连续两轮一致”才显示

提交后状态是 `aiReview`，逐题分数还在写入，实测会出现 `97 → null → 100`。工具不会固定等几秒，而是轮询：

- 状态 `aiReview`：只显示“AI 批阅中”，不读分数
- 状态 `unReview`：读取 20 条记录 → 再读一次详情确认状态和提交时间没变
- 记录数必须等于 `questionNum`，不能有重复题号、空分数、负数、非有限值
- 顶层 `answerScore` 求和必须和非空的 `absScore` 对得上
- 连续两轮“逐题得分 + 提交身份”完全一致，才返回结果

轮询间隔从 1.5 秒逐步退避到 15 秒，最长等 15 分钟；状态回退、重新提交、题目缺失都会清空已确认值。

### 4. 只调两个只读接口

```
POST /cloud/student-homework/homeworkStudent/getStudentHomeworkDetail
POST /cloud/student-homework/homeworkStudentExam/examAnswersAndStatisticsQuery
```

请求体只包含 6 个字段：`homeworkId`、`paperId`、`examId`、`courseId`、`term`、`studentId`。不调用保存、提交、重交、发布接口，不加载外部脚本，不访问第三方域名。

## 能力边界

- ✅ 能回答「我这次大概得了多少分」
- ✅ 能按题号列出「第 1–20 题各得几分」
- ❌ 不能回答「哪题错了、正确答案是什么」

原因在权限层：接口返回给学生的每条记录里，`isCorrect` 一律为 0，标准答案由服务端拦住。逐题得分是平台已经算好的原始数据，可以展示；但对错和答案拿不到，所以只能看分数分布，做不了错题分析。

- ✅ 支持个人、题目型作业
- ❌ 不支持小组作业、文件型作业、已发布成绩、非 `aiReview/unReview` 状态
- ⚠️ 结果是读取时刻的快照，老师复核或调分后会变，最终以平台公布为准

## 验证记录（2026-10-23，真实账号）

- 环境：Edge 155 / Windows
- 接口：`status=unReview`、`isPublish=0`、20 条记录、逐题得分与 `absScore` 一致
- 认证：`document.cookie` 中的 `jt-cas` 为 366 字符 JWT，直接作为 `Authorization` 请求返回 200
- 运行：点书签后 **7 次请求、约 5 秒**得到结果；展开诊断信息后 20 项逐题得分齐全；重复点击“重新读取”正常；关闭面板后 host 与全局引用都被清理
- 体积：书签地址 `75,329` 字符（73.6 KB）。用 Edge 的 `chrome.bookmarks.create` 以该完整 URL 创建收藏项，读回 `same: true`，长度未截断；随后删除测试项
- 自动化测试：`npm test` 共 15 项，覆盖小数/零分、`97 → null → 100`、状态回退、重新提交、题目缺失、重复记录、跨账号、超满分、超时、取消

未覆盖：小组作业、文件型作业、成绩发布后的页面、其他浏览器（Chrome/Firefox/Safari）。

## 开发

无需安装依赖，Node.js ≥ 20：

```bash
npm test        # 纯逻辑单测（15 项）
npm run build   # 生成书签地址、2/3/4 号文件、文字说明
npm run manual  # 生成 1 号安装图解 HTML（图片内联）
npm run package # 以上全部 + 打包 zip
```

`src/core.js` 是纯逻辑（可在 Node 里用固定时钟测试），`src/app.js` 是界面、认证与网络。构建脚本把两者拼成一个 IIFE，再用 `encodeURIComponent` 生成 `javascript:` 书签地址。

> 说明书 PDF 由 Edge 的 `Page.printToPDF` 生成，页面尺寸 A4、`@page margin:0`；HTML 与 PDF 内容一致。

## 目录

```
src/core.js          纯逻辑：解析参数 / 校验作业 / 汇总得分 / 轮询
src/app.js           界面、认证、请求、状态机
assets/install.html  安装页模板
assets/guide.html    文字版使用说明模板
assets/manual.html   安装图解模板（3 页 A4）
docs/                说明书用到的截图
scripts/build.cjs    构建
scripts/manual.cjs   安装图解 HTML
scripts/package.cjs  打包 zip
test/core.test.cjs   单测
```

## 已知限制与风险

- 依赖平台现有接口与登录方式，平台改版后可能失效。
- 书签地址约 74 KB，明显大于普通书签；已在 Edge 155 验证可完整保存，但很旧的浏览器或某些同步服务可能截断。
- `aiReview` 可能持续很久；工具会等 15 分钟，超时后提示稍后重试。
- 不是学校官方功能。请勿把登录令牌、完整网络日志或他人成绩提交到公开仓库。

## 许可

仅用于个人学习与产品练习。使用前请确认符合学校平台的使用条款；成绩以老师和平台公布的为准。
