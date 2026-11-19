# jp-vocab-trainer

把日语单词表做成离线背诵网页的 Claude Code 技能。生成结果是**单个 HTML 文件**，
双击就能用，不联网、不装依赖，进度存在浏览器本地。

## 功能

- **看日语选中文**：显示汉字和假名注音，4 个中文释义，干扰项按近义、同类、形近手工设计。
- **看汉字写假名**：4 个假名选项，干扰项由正确读音做长音、拗音、促音、清浊音变形生成。
- **看假名写汉字**：4 个汉字选项；混写词保证结尾假名一致，读音不重复，必要时可用假词。
- 乱序闯关：答错的词全部进下一轮，只答对过一次的词随机抽 30% 复习；连续答对两次的词不再出现。
- 进度按“答对过一次”计算；进度 100% 后进入最终复习，所有词都连续答对两次才通关。
- 三个模式独立进度，主页进度条和百分比实时显示。
- **错题回顾**：主页入口进入独立表格页，列出全部词在三个模式下的累计答错次数，
  按总次数排序；纯假名词的模式二、三显示「—」。
- localStorage 自动存档，关掉页面再打开可继续；错题计数跨轮保留。

## 安装

```bash
mkdir -p ~/.claude/skills
git clone https://github.com/zhaoxuandai/jp-vocab-trainer.git ~/.claude/skills/jp-vocab-trainer
```

Windows PowerShell：

```powershell
New-Item -ItemType Directory -Force "$HOME\.claude\skills" | Out-Null
git clone https://github.com/zhaoxuandai/jp-vocab-trainer.git "$HOME\.claude\skills\jp-vocab-trainer"
```

装好后新开一个 Claude Code 会话，技能列表里会出现 `jp-vocab-trainer`。

## 使用

直接对 Claude 说：

- “用 jp-vocab-trainer 根据这个 PDF 做一个单词背诵网页”
- “把这份词表做成看汉字写假名的闯关页面”
- “用这个技能帮我生成日语单词练习”

Claude 会先确认词表范围、外来语处理、复习比例、是否允许假词，
然后提取词表、生成页面并运行校验。

## 目录

```
SKILL.md                 技能说明（Claude 读取）
assets/template.html     完整页面模板（10 个示例词）
scripts/pdf_to_images.py PDF 逐页转 PNG
scripts/validate.mjs     数据、选项、流程自动校验
reference/distractors.md 易混干扰项设计手册
```

## 手动校验

改完页面数据后：

```bash
node scripts/validate.mjs 单词背诵.html
```

输出 `PASS` 表示词表、干扰项、选项和闯关流程都正常。

## 注意

- 扫描版 PDF 没有文字层，需要转图片后逐页识读；不要依赖普通 PDF 取文字。
- 每个新词表记得改 `STORE_KEY`，否则同一浏览器里不同页面会共用进度。
- 本地文件（`file://`）的 localStorage 行为因浏览器而异，推荐 Chrome / Edge / Firefox。
