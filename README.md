# AI DJ

AI DJ 是一个桌面端网易云音乐播放器。它内置电台 DJ 面板，可以接入 OpenAI-compatible 聊天模型和 MiMo 语音模型，让 AI 根据当前歌曲、歌单和你的点歌请求自动串词、找歌、生成歌单，并在播报时自动压低音乐音量。

安装后不需要手动改代码。打开软件，点击歌单标题右侧的设置按钮，填写网易云 Cookie、OpenAI-compatible 接口和 MiMo 语音接口即可使用。

## 下载与安装

到 GitHub Releases 下载对应系统的安装包：

- Windows：下载 `AI DJ Setup ... .exe`，双击安装。
- macOS：下载 `.dmg`，拖入 Applications 后打开。

首次打开后，点击随机播放按钮旁边的齿轮按钮，填写下面三组配置并保存。

## 必填配置

### 网易云 Cookie

用于读取每日推荐、收藏歌单和会员可播放链接。

常见形态：

```text
MUSIC_U=...; __csrf=...
```

### OpenAI-compatible DJ 接口

用于 AI DJ 对话、点歌决策和歌曲串词。支持任何兼容 `/chat/completions` 的服务。

需要填写：

- URL 地址，例如 `https://api.example.com/v1`
- 模型名称，例如 `gpt-4o-mini`、`deepseek-chat` 或你的服务商模型名
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

保存后配置会立即生效，并写入当前系统用户的应用数据目录。真实 Key 和 Cookie 不会提交到仓库。

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

macOS 安装包建议通过 GitHub Actions 在 macOS runner 上构建：

```bash
npm run dist:mac
```

## 发布

推送代码到 GitHub 后，仓库里的 GitHub Actions 会自动构建 Windows 和 macOS 安装包。你也可以创建 tag 触发 Release：

```bash
git tag v0.1.0
git push origin v0.1.0
```

工作流会把安装包上传为构建产物，并在 tag 发布时附加到 GitHub Release。

## 安全提醒

不要把 `.env`、网易云 Cookie 或任何 API Key 提交到 GitHub。仓库已通过 `.gitignore` 排除这些本地配置。安装版会把设置保存到用户自己的应用数据目录，卸载或换电脑时需要重新填写。
