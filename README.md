# AI DJ

把网易云音乐变成你的私人 AI 电台。

AI DJ 是一个桌面端音乐播放器。它把网易云音乐、AI 导播、歌单搜索和语音播报放在一个小窗口里。你不需要改代码，也不需要自己搭后端；安装后打开设置，填入自己的网易云 Cookie、OpenAI-compatible 接口和 MiMo 语音接口，就可以直接使用。

## 为什么方便

- 安装即用：Windows 和 macOS 都有现成安装包。
- 只填 API：所有配置都在软件里的设置面板完成，不需要手动编辑 `.env`。
- 支持通用接口：DJ 对话使用 OpenAI-compatible `/chat/completions`，DeepSeek、OpenAI 兼容网关或其他兼容服务都可以接。
- 自动 DJ 串词：播放歌曲时，AI 会根据当前歌曲、上一首歌、时间和歌单氛围生成电台风格串词。
- 会帮你找歌：可以直接告诉 DJ “来点适合开车的歌”“想听周杰伦”“放点深夜安静的”，它会搜索歌曲或歌单并自动播放。
- 语音播报：接入 MiMo 后，AI 的串词可以直接变成语音，播报时会自动压低音乐音量。
- 配置保存在本机：Cookie 和 API Key 只保存在当前电脑的用户数据目录，不会上传到仓库。

## 下载

到 GitHub Releases 下载最新版本：

[下载最新版 AI DJ](https://github.com/mmmccc49/ai-dj-/releases/latest)

普通用户只需要下载：

- Windows：`AI.DJ.Setup...exe`
- macOS：`AI.DJ...mac.zip`

其他 `.blockmap`、`.yml` 和 `Source code` 文件主要用于自动更新或开发，不需要下载。

## 第一次使用

1. 安装并打开 AI DJ。
2. 点击歌单标题右侧、随机播放按钮旁边的齿轮按钮。
3. 填写网易云 Cookie。
4. 填写 OpenAI-compatible DJ 接口的 URL、模型名称和 Key。
5. 填写 MiMo 语音模型的 URL、模型名称和 Key。
6. 点击保存，回到播放器开始使用。

保存后配置立即生效。以后重新打开软件也会自动读取本机已保存的设置。

## 需要准备什么

### 网易云 Cookie

用于读取每日推荐、收藏歌单和会员可播放链接。

常见形态：

```text
MUSIC_U=...; __csrf=...
```

### OpenAI-compatible DJ 接口

用于 AI DJ 对话、点歌决策、歌单搜索意图和歌曲串词。

需要填写：

- URL 地址，例如 `https://api.deepseek.com` 或 `https://api.example.com/v1`
- 模型名称，例如 `deepseek-chat`、`gpt-4o-mini` 或服务商提供的模型名
- Key

### MiMo 语音模型

用于把 DJ 串词生成语音。

默认 URL：

```text
https://token-plan-cn.xiaomimimo.com/v1
```

默认模型：

```text
mimo-v2.5-tts-voicedesign
```

需要填写：

- URL 地址
- 模型名称
- Key

## 常见使用场景

- “来点适合工作时听的歌。”
- “放一些深夜安静的中文歌。”
- “想听周杰伦，帮我从比较经典的开始。”
- “今天开车，来点有速度感的。”
- “介绍一下现在这首歌。”

AI DJ 会尽量把你的自然语言请求转换成网易云音乐里的歌曲、歌手或歌单搜索，并自动开始播放。

## 完全卸载

普通卸载只会删除软件本体。若你想同时删除本机保存的网易云 Cookie、API Key、缓存、日志和快捷方式，可以在 Release 里下载完全卸载工具：

- Windows：下载 `AI-DJ-Complete-Uninstall-Windows.cmd` 和 `AI-DJ-Complete-Uninstall-Windows.ps1`，放在同一个文件夹里，双击 `.cmd` 运行。
- macOS：下载 `AI-DJ-Complete-Uninstall-macOS.command`，在终端里运行。

完全卸载工具会要求输入 `REMOVE` 后才会继续执行。

## 本地开发

```bash
npm install
npm start
```

语法检查：

```bash
npm run check
```

Windows 本地打包：

```bash
npm run dist:win
```

macOS 打包建议通过 GitHub Actions 在 macOS runner 上构建：

```bash
npm run dist:mac
```

## 安全提醒

不要把 `.env`、网易云 Cookie 或任何 API Key 提交到 GitHub。仓库已通过 `.gitignore` 排除这些本地配置。安装版会把设置保存到用户自己的应用数据目录，卸载或换电脑时需要重新填写。
