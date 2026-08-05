# Progress Dashboard / 学习项目进度看板

![Obsidian](https://img.shields.io/badge/Obsidian-1.0.0+-blue)
![Version](https://img.shields.io/badge/version-1.0.0-green)
![License](https://img.shields.io/badge/license-MIT-yellow)

一个 Obsidian 插件，用于可视化展示和管理学习技能的进度。通过扫描笔记 YAML 中的 `skill` 和 `skill-progress` 字段，自动关联笔记到技能，并支持手动拖动调整进度。

---

## ✨ 功能特性

- 🎯 **技能进度可视化** - 进度条展示每个技能的完成状态
- 📝 **笔记自动关联** - 通过 YAML 字段自动关联笔记到技能
- 🖱️ **手动拖动进度** - 直接拖动进度条调整进度
- 🏷️ **分类管理** - 支持自定义技能分类
- 🔗 **多笔记关联** - 一个技能可关联多个笔记
- 📚 **父子技能结构** - 支持技能的层级结构（如：编程 → Python/JavaScript）
- 📊 **笔记列表展示** - 右侧显示关联的笔记，可点击跳转
- 🔄 **跨仓库支持** - 支持扫描 Obsidian 中所有打开的 Vault
- 📌 **分类置顶** - 重要分类可以置顶显示
- 📅 **日期记录** - 为技能添加开始日期和结束日期

---

## 📥 安装方式

### 方式一：通过 Obsidian 社区插件市场（推荐）

1. 打开 Obsidian 设置 → 第三方插件
2. 关闭"安全模式"
3. 点击"浏览"
4. 搜索 "Progress Dashboard"
5. 点击"安装"

### 方式二：手动安装

1. 下载最新的 `main.js`、`manifest.json`、`styles.css`
2. 将文件放入你的 Obsidian Vault 的 `.obsidian/plugins/progress-dashboard/` 目录
3. 重启 Obsidian
4. 在设置中启用插件

```bash
# 目录结构应该是：
# YourVault/
#   └── .obsidian/
#       └── plugins/
#           └── progress-dashboard/
#               ├── main.js
#               ├── manifest.json
#               └── styles.css
```

---

## 📖 使用说明

### 1. 创建技能

点击顶部工具栏的 **"+ 添加技能"** 按钮，填写：
- **分类**：技能所属分类（如：技术、学习、生活）
- **技能名称**：技能的名称
- **技能描述**：简要描述，用顿号/逗号分隔可拆为子技能

**示例**：
- 分类：`技术`
- 名称：`编程`
- 描述：`Python、JavaScript、Rust`（会创建三个子技能）

### 2. 通过笔记关联技能

在笔记的 YAML frontmatter 中添加 `skill` 字段：

```yaml
---
skill: 编程
skill-progress: 50
---
```

如果笔记关联子技能，使用 `/` 分隔：

```yaml
---
skill: 编程/Python
skill-progress: 80
---
```

### 3. 调整进度

- **手动拖动**：直接拖动进度条调整进度
- **笔记驱动**：笔记的 `skill-progress` 字段会自动同步进度

**进度优先级**：
1. 手动拖动（最高优先级）
2. 笔记的 `skill-progress` 字段
3. 默认 0%

### 4. 删除笔记关联

鼠标悬停在技能右侧的笔记标签上，会显示 **×** 按钮，点击即可删除关联。

### 5. 重置数据

点击顶部工具栏的 **"重置"** 按钮，将清除所有数据恢复到初始状态。

---

## 🏗️ 开发

### 环境要求

- Node.js >= 16
- npm

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建

```bash
npm run build
```

---

## 📁 文件结构

```
progress-dashboard/
├── main.ts          # TypeScript 源代码
├── main.js          # 构建产物
├── manifest.json    # 插件清单
├── styles.css       # 样式文件
├── versions.json    # 版本历史
├── package.json     # 包配置
├── esbuild.config.mjs  # 构建配置
└── tsconfig.json    # TypeScript 配置
```

---

## 🤝 贡献

欢迎贡献代码！请：

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

---

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

---

## 🌟 致谢

感谢所有使用和贡献本插件的用户！

---

# Progress Dashboard for Obsidian

A powerful Obsidian plugin for visualizing and managing learning skill progress. Automatically associates notes with skills by scanning YAML `skill` and `skill-progress` fields, with support for manual drag-to-adjust progress.

---

## ✨ Features

- 🎯 **Skill Progress Visualization** - Visual progress bars for each skill
- 📝 **Auto Note Association** - Automatically link notes to skills via YAML fields
- 🖱️ **Manual Progress Adjustment** - Drag progress bars directly
- 🏷️ **Category Management** - Organize skills with custom categories
- 🔗 **Multi-Note Support** - Associate multiple notes with a single skill
- 📚 **Parent-Child Structure** - Hierarchical skill structure (e.g., Programming → Python/JavaScript)
- 📊 **Note List Display** - View associated notes on the right side, clickable
- 🔄 **Multi-Vault Support** - Scans all Vaults open in Obsidian
- 📌 **Pin Categories** - Pin important categories to the top
- 📅 **Date Tracking** - Add start and end dates to skills

---

## 📥 Installation

### Option 1: Community Plugins (Recommended)

1. Open Obsidian Settings → Community Plugins
2. Turn off "Restricted mode"
3. Click "Browse"
4. Search for "Progress Dashboard"
5. Click "Install"

### Option 2: Manual Installation

1. Download the latest `main.js`, `manifest.json`, `styles.css`
2. Place files in `.obsidian/plugins/progress-dashboard/` directory
3. Restart Obsidian
4. Enable the plugin in settings

---

## 📖 Usage

### 1. Create a Skill

Click the **"+ Add Skill"** button in the toolbar, fill in:
- **Category**: Skill category (e.g., Technology, Learning, Life)
- **Skill Name**: Name of the skill
- **Description**: Brief description, use commas to create sub-skills

**Example**:
- Category: `Technology`
- Name: `Programming`
- Description: `Python, JavaScript, Rust` (creates three sub-skills)

### 2. Associate Notes via YAML

Add `skill` field to your note's YAML frontmatter:

```yaml
---
skill: Programming
skill-progress: 50
---
```

For sub-skills, use `/` separator:

```yaml
---
skill: Programming/Python
skill-progress: 80
---
```

### 3. Adjust Progress

- **Manual Drag**: Drag the progress bar directly
- **Note-Driven**: The `skill-progress` field in notes automatically syncs

**Progress Priority**:
1. Manual drag (highest priority)
2. Note's `skill-progress` field
3. Default 0%

### 4. Remove Note Association

Hover over the note tag on the right side of the skill, an **×** button will appear, click to remove.

### 5. Reset Data

Click the **"Reset"** button to clear all data and restore to initial state.

---

## 🏗️ Development

### Prerequisites

- Node.js >= 16
- npm

### Install Dependencies

```bash
npm install
```

### Development Mode

```bash
npm run dev
```

### Build

```bash
npm run build
```

---

## 📁 File Structure

```
progress-dashboard/
├── main.ts          # TypeScript source
├── main.js          # Build output
├── manifest.json    # Plugin manifest
├── styles.css       # Style file
├── versions.json    # Version history
├── package.json     # Package config
├── esbuild.config.mjs  # Build config
└── tsconfig.json    # TypeScript config
```

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork this repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

## 🌟 Acknowledgments

Thanks to all users who use and contribute to this plugin!
