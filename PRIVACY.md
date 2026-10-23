# 隐私说明

**一句话：所有数据都只在你当前这个标签页的内存里。关掉面板就没了。**

## 工具会读取什么

| 数据 | 用途 | 是否离开浏览器 |
| --- | --- | --- |
| 地址栏里的 `courseId` / `homeworkId` / `termId` | 拼查询参数 | 否，只发给 `aic.sysu.edu.cn` |
| 登录令牌（Cookie 或页面已保存的 token） | 作为 `Authorization` 请求头 | 否，只发给 `aic.sysu.edu.cn` |
| 作业详情：题数、满分、`studentId`、`paperId`、`examId`、`submitTime` | 校验是不是当前作业 | 否 |
| 逐题得分 `answerScore` | 求和得到卷面分 | 否 |

## 工具不会做什么

- 不写 Cookie、`localStorage`、`sessionStorage`、IndexedDB。
- 不向任何第三方域名发请求，不加载外部脚本、字体或图片。
- 不保存成绩、不生成历史记录、不导出文件。
- 不调用保存、提交、重交、发布接口；不修改你的答案。
- 不读取或显示标准答案（接口本身也不给）。
- 不收集遥测、不埋点、不生成用户标识。

## 令牌怎么处理

令牌在页面脚本的闭包变量里，只在发请求时使用；关闭面板时置空。它不会出现在界面上，也不会进入“复制成绩”或“复制诊断信息”的文本。诊断信息只包含：版本、当前 URL、`homeworkId`、状态、令牌来源（如 `Cookie jt-cas`，不是令牌值）、请求次数、用时、错误码，以及每题得分（题号 → 分数）。

## 数据会不会上传

不会。唯一的网络请求是发往 `https://aic.sysu.edu.cn` 的两个同源 POST：

```
/cloud/student-homework/homeworkStudent/getStudentHomeworkDetail
/cloud/student-homework/homeworkStudentExam/examAnswersAndStatisticsQuery
```

这是平台自己的接口，和你点开作业页时浏览器发的请求同一目的地。

## 你需要注意

- 不要把浏览器网络面板里的 `Authorization`、Cookie 或完整请求日志截图发到公开群组或仓库。
- 本工具不是学校官方功能；使用前请确认符合平台使用条款。
- 成绩以老师和平台公布的为准。
