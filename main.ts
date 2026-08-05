import {
	App,
	Plugin,
	ItemView,
	WorkspaceLeaf,
	TFile,
	Notice,
	Modal,
	Setting,
} from "obsidian";

const VIEW_TYPE_PROGRESS = "progress-dashboard-view";

/* ===== 类型定义 ===== */
interface BuiltinSkill {
	name: string;
	desc: string;
}

interface SkillCategory {
	category: string;
	skills: BuiltinSkill[];
}

interface SkillEntry {
	name: string;
	desc: string;
	category: string;
	progress: number;
	manualProgress: number | null;
	noteProgress: number | null;
	files: TFile[];
	hasNote: boolean;
	parentName: string | null;
	children: SkillEntry[];
}

type SortMode = "progress-desc" | "progress-asc" | "name-asc";

interface CustomSkill {
	name: string;
	desc: string;
	category: string;
}

interface PluginData {
	manualProgress: Record<string, number>;
	customSkills: CustomSkill[];
	attachedNotes: Record<string, string[]>;
	excludedNotes: Record<string, string[]>;  /* 被用户主动删除的笔记，扫描时跳过 */
	deletedSkills: string[];
	pinnedCategories: string[];
	skillStartDates: Record<string, string>;
	skillEndDates: Record<string, string>;
}

const DEFAULT_DATA: PluginData = {
	manualProgress: {},
	customSkills: [],
	attachedNotes: {},
	excludedNotes: {},
	deletedSkills: [],
	pinnedCategories: [],
	skillStartDates: {},
	skillEndDates: {},
};

/* ===== 内置技能数据 ===== */
const SKILL_DATA: SkillCategory[] = [
	{
		category: "生存实用技能",
		skills: [
			{ name: "基础医疗", desc: "急救、包扎、基础注射" },
			{ name: "生活烹饪", desc: "家常菜制作" },
			{ name: "烘焙甜点制作", desc: "烘焙甜点制作" },
			{ name: "手工编织", desc: "手链、中国结、十字绣" },
			{ name: "消费维权", desc: "证据留存、各平台投诉渠道" },
		],
	},
	{
		category: "法律职场技能",
		skills: [
			{ name: "劳动合同法", desc: "劳动合同法相关法律常识" },
			{ name: "Word文档排版", desc: "Word文档排版、公文写作" },
			{ name: "Excel函数", desc: "Excel函数、数据统计、制作" },
			{ name: "PPT美化", desc: "PPT美化、汇报逻辑搭建" },
			{ name: "电脑快捷键", desc: "电脑全品类快捷键操作" },
			{ name: "专业课深耕", desc: "专业课深耕，MOOC公开课补充学习" },
			{ name: "通用证书", desc: "六级、驾照" },
			{ name: "职业证书", desc: "教资、初会、游泳教练证" },
			{ name: "Photoshop", desc: "Photoshop图片修图、平面设计" },
			{ name: "Premiere", desc: "Premiere视频剪辑、成片产出" },
			{ name: "After Effects", desc: "After Effects动态特效制作" },
			{ name: "基础编程", desc: "基础编程入门学习" },
			{ name: "考研考公", desc: "考研、考公全套备考规划" },
			{ name: "学科竞赛", desc: "挑战杯等高含金量学科竞赛备赛" },
		],
	},
	{
		category: "财商金融",
		skills: [
			{ name: "基础理财", desc: "基础理财、可转债、股票入门实操" },
			{ name: "货币金融知识", desc: "加息、降息、货币放水、资产定价" },
			{ name: "宏观经济周期", desc: "债务周期、经济周期判断" },
		],
	},
	{
		category: "认知提升",
		skills: [
			{ name: "读书", desc: "心理学、社会学、逻辑学、管理学、博弈论" },
			{ name: "视听拓展", desc: "纪录片、TED演讲" },
			{ name: "外语视听", desc: "英剧、美剧、优质动漫" },
			{ name: "棋类", desc: "象棋、围棋、国际象棋" },
			{ name: "环球义工旅行", desc: "年满18岁寒暑假参与" },
		],
	},
	{
		category: "运动健身",
		skills: [
			{ name: "季节运动", desc: "轮滑（夏季）、冰刀（冬季）" },
			{ name: "团队球类", desc: "篮球、排球、足球" },
			{ name: "休闲小球类", desc: "乒乓、羽毛球、网球" },
			{ name: "小众球类", desc: "台球、高尔夫、保龄球、橄榄球、冰壶" },
			{ name: "塑形舒缓", desc: "瑜伽、普拉提" },
			{ name: "防身格斗", desc: "武术、散打、拳击、摔跤" },
			{ name: "武道项目", desc: "跆拳道、柔道、剑道" },
			{ name: "潮流运动", desc: "滑板" },
			{ name: "基础体能", desc: "田径、骑行、跳绳、游泳" },
			{ name: "户外休闲", desc: "潜水、登山、冲浪、蹦床、健美操" },
			{ name: "小众体能", desc: "射击、射箭、举重" },
			{ name: "健身房力量训练", desc: "健身房系统化常规力量训练" },
		],
	},
	{
		category: "艺术才艺",
		skills: [
			{ name: "绘画", desc: "素描、水彩、线描、油画" },
			{ name: "硬笔练字", desc: "长期固定字体练习" },
			{ name: "小语种语言", desc: "小语种语言学习" },
			{ name: "声乐唱歌", desc: "音准气息控制" },
			{ name: "主流乐器", desc: "吉他、钢琴、古筝、小提琴" },
			{ name: "轻便小型乐器", desc: "拇指琴、竖笛、空灵鼓" },
			{ name: "舞蹈", desc: "街舞、爵士、民族、拉丁、芭蕾" },
			{ name: "休闲舞蹈", desc: "宅舞、基础交际舞" },
			{ name: "美妆设计", desc: "日常完整妆容打造" },
			{ name: "美甲美发", desc: "美甲、基础美发造型设计" },
			{ name: "摄影", desc: "构图、人像、风光基础拍摄" },
			{ name: "趣味才艺", desc: "魔术、魔方、魔板" },
		],
	},
	{
		category: "项目开发",
		skills: [
			{ name: "项目开发", desc: "插件、软件、代码" },
		],
	},
];

function parseChildren(desc: string): string[] | null {
	if (!desc) return null;
	const parts = desc
		.split(/[、，,]/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0 && !isOnlyPunct(s));
	if (parts.length >= 2) return parts;
	return null;
}

function isOnlyPunct(s: string): boolean {
	return /^[\s\-—、，,()（）]+$/.test(s);
}

function getSkillKey(parent: string | null, name: string): string {
	return parent ? `${parent}/${name}` : name;
}

/* ===== 插件主体 ===== */
export default class ProgressDashboardPlugin extends Plugin {
	data: PluginData = DEFAULT_DATA;

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_PROGRESS,
			(leaf: WorkspaceLeaf) => new ProgressDashboardView(leaf, this)
		);

		this.addCommand({
			id: "open-progress-dashboard",
			name: "打开学习项目进度看板",
			callback: () => this.activateView(),
		});

		this.addRibbonIcon("bar-chart-3", "学习项目进度看板", () => {
			this.activateView();
		});
	}

	async onunload() {}

	async loadSettings() {
		const loaded = await this.loadData();
		this.data = Object.assign({}, DEFAULT_DATA, loaded);
		
		/* 数据清理：去除重复的自定义技能 */
		const seenNames = new Set<string>();
		const uniqueCustomSkills: CustomSkill[] = [];
		for (const cs of this.data.customSkills) {
			if (!cs || !cs.name) continue;
			if (seenNames.has(cs.name)) continue;
			seenNames.add(cs.name);
			uniqueCustomSkills.push(cs);
		}
		this.data.customSkills = uniqueCustomSkills;
		
		/* 数据清理：去除空的字段 */
		if (!this.data.manualProgress) this.data.manualProgress = {};
		if (!this.data.customSkills) this.data.customSkills = [];
		if (!this.data.attachedNotes) this.data.attachedNotes = {};
		if (!this.data.excludedNotes) this.data.excludedNotes = {};
		if (!this.data.deletedSkills) this.data.deletedSkills = [];
		if (!this.data.pinnedCategories) this.data.pinnedCategories = [];
		if (!this.data.skillStartDates) this.data.skillStartDates = {};
		if (!this.data.skillEndDates) this.data.skillEndDates = {};
		
		/* 数据迁移：从旧的 skillDates 迁移到新的 skillStartDates */
		if ((this.data as any).skillDates) {
			for (const [k, v] of Object.entries((this.data as any).skillDates)) {
				if (v && !this.data.skillStartDates[k]) {
					this.data.skillStartDates[k] = v as string;
				}
			}
			delete (this.data as any).skillDates;
		}
		
		/* 数据清理：去除重复的置顶分类 */
		const uniquePinned: string[] = [];
		const seenCats = new Set<string>();
		for (const cat of this.data.pinnedCategories) {
			if (!seenCats.has(cat)) {
				seenCats.add(cat);
				uniquePinned.push(cat);
			}
		}
		this.data.pinnedCategories = uniquePinned;
		
		await this.saveSettings();
	}

	async saveSettings() {
		await this.saveData(this.data);
	}

	async activateView() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_PROGRESS);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: VIEW_TYPE_PROGRESS,
			active: true,
		});
		this.app.workspace.revealLeaf(leaf);
	}
}

class ProgressDashboardView extends ItemView {
	plugin: ProgressDashboardPlugin;
	private sortMode: SortMode = "progress-desc";
	private entries: SkillEntry[] = [];
	private expandedSkills: Set<string> = new Set();
	private searchQuery: string = "";

	constructor(leaf: WorkspaceLeaf, plugin: ProgressDashboardPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_PROGRESS;
	}

	getDisplayText(): string {
		return "学习项目进度看板";
	}

	getIcon(): string {
		return "bar-chart-3";
	}

	async onOpen() {
		this.renderView();
	}

	async onClose() {
		/* 清理拖动事件监听器 */
		const cleanup = (this as any)._viewCleanup;
		if (cleanup && Array.isArray(cleanup)) {
			for (const fn of cleanup) {
				try { fn(); } catch (e) { /* ignore */ }
			}
			(this as any)._viewCleanup = [];
		}
	}

	private matchesSearch(entry: SkillEntry, query: string): boolean {
		if (!query) return true;
		if (entry.name.toLowerCase().includes(query)) return true;
		if (entry.desc.toLowerCase().includes(query)) return true;
		return false;
	}

	private filterEntries(entries: SkillEntry[], query: string): SkillEntry[] {
		if (!query) return entries;
		return entries
			.map((entry) => {
				const nameMatch = this.matchesSearch(entry, query);
				const matchingChildren = entry.children.filter((c) => this.matchesSearch(c, query));
				if (nameMatch) {
					return entry;
				}
				if (matchingChildren.length > 0) {
					return { ...entry, children: matchingChildren };
				}
				return null;
			})
			.filter((e): e is SkillEntry => e !== null);
	}

	private async renderView() {
		const container = this.contentEl;
		container.empty();
		container.addClass("progress-dashboard");

		this.entries = this.buildEntries();

		const header = container.createDiv("pd-header");
		header.createEl("h2", { text: "学习项目进度看板" });

		const flatEntries = this.flattenEntries();
		const stats = this.calcStats(flatEntries);
		const statsBar = container.createDiv("pd-stats");
		this.renderStat(statsBar, "总技能", String(stats.count), "var(--text-normal)");
		this.renderStat(statsBar, "平均进度", stats.avg + "%", this.getColorByProgress(stats.avg));
		this.renderStat(statsBar, "已完成", String(stats.completed), "#00e676");
		this.renderStat(statsBar, "进行中", String(stats.inProgress), "#00b0ff");
		this.renderStat(statsBar, "刚起步", String(stats.started), "#ff9100");
		this.renderStat(statsBar, "未开始", String(stats.notStarted), "var(--text-faint)");

		const toolbar = container.createDiv("pd-toolbar");
		toolbar.createEl("span", { cls: "pd-sort-label", text: "排序：" });
		const sortSelect = toolbar.createEl("select", { cls: "pd-sort-select" });
		const options: { value: SortMode; text: string }[] = [
			{ value: "progress-desc", text: "进度（高→低）" },
			{ value: "progress-asc", text: "进度（低→高）" },
			{ value: "name-asc", text: "名称（A→Z）" },
		];
		for (const opt of options) {
			const el = sortSelect.createEl("option", { value: opt.value, text: opt.text });
			if (opt.value === this.sortMode) el.selected = true;
		}
		sortSelect.addEventListener("change", () => {
			this.sortMode = sortSelect.value as SortMode;
			this.renderView();
		});

		const refreshBtn = toolbar.createEl("button", { cls: "pd-refresh-btn", text: "刷新" });
		refreshBtn.addEventListener("click", () => this.renderView());

		/* 搜索 */
		const searchInput = toolbar.createEl("input", { cls: "pd-search-input", attr: { placeholder: "搜索技能…" } });
		searchInput.value = this.searchQuery;
		searchInput.addEventListener("input", () => {
			this.searchQuery = searchInput.value.toLowerCase().trim();
			this.renderView();
		});

		const addBtn = toolbar.createEl("button", { cls: "pd-add-btn", text: "+ 添加技能" });
		addBtn.addEventListener("click", () => {
			new AddSkillModal(this.app, (name, desc, category) => {
				console.log("[ProgressDashboard] 添加技能:", { name, desc, category });
				console.log("[ProgressDashboard] 当前 entries:", this.entries.map(e => e.name));
				console.log("[ProgressDashboard] customSkills:", this.plugin.data.customSkills);
				console.log("[ProgressDashboard] deletedSkills:", this.plugin.data.deletedSkills);
				
				const exists = this.entries.some((e) => e.name === name && !e.parentName);
				if (exists) {
					new Notice("该技能已存在：" + name);
					return;
				}
				this.plugin.data.customSkills.push({ name, desc, category });
				
				/* 如果之前删除过同名技能，从 deletedSkills 中移除 */
				const skillKey = getSkillKey(null, name);
				if (this.plugin.data.deletedSkills.includes(skillKey)) {
					this.plugin.data.deletedSkills = this.plugin.data.deletedSkills.filter(
						(k) => k !== skillKey
					);
				}
				
				this.plugin.saveSettings();
				console.log("[ProgressDashboard] 保存后 customSkills:", this.plugin.data.customSkills);
				this.renderView();
				new Notice("已添加技能：" + name);
			}).open();
		});

		/* 重置按钮 */
		const resetBtn = toolbar.createEl("button", { cls: "pd-reset-btn", text: "重置" });
		resetBtn.title = "清除所有数据";
		resetBtn.addEventListener("click", () => {
			new ConfirmModal(this.app, "重置看板", "确定要重置所有数据吗？\n这将清除所有进度、自定义技能、笔记关联等数据。\n（不会删除硬盘上的笔记文件）", () => {
				this.plugin.data.manualProgress = {};
				this.plugin.data.attachedNotes = {};
				this.plugin.data.excludedNotes = {};
				this.plugin.data.customSkills = [];
				this.plugin.data.deletedSkills = [];
				this.plugin.data.pinnedCategories = [];
				this.plugin.data.skillStartDates = {};
				this.plugin.data.skillEndDates = {};
				this.plugin.saveSettings();
				this.renderView();
				new Notice("已重置所有数据");
			}).open();
		});

		const allCategories = this.getAllCategories();
		const pinnedCats = new Set(this.plugin.data.pinnedCategories);
		allCategories.sort((a, b) => {
			const aPinned = pinnedCats.has(a.category) ? 0 : 1;
			const bPinned = pinnedCats.has(b.category) ? 0 : 1;
			return aPinned - bPinned;
		});

		for (const cat of allCategories) {
			let catEntries = this.entries.filter((e) => e.category === cat.category && !e.parentName);
			catEntries = this.filterEntries(catEntries, this.searchQuery);
			if (catEntries.length === 0) continue;

			const sorted = this.sortEntries(catEntries, this.sortMode);

			const catSection = container.createDiv("pd-category-section");
			if (pinnedCats.has(cat.category)) {
				catSection.addClass("pd-category-pinned");
			}
			const catHeader = catSection.createDiv("pd-category-header");
			catHeader.createEl("span", { cls: "pd-category-title", text: cat.category });

			/* 分类置顶按钮 */
			const isCatPinned = pinnedCats.has(cat.category);
			const catPinBtn = catHeader.createEl("span", { cls: "pd-cat-pin-btn" + (isCatPinned ? " pd-pin-active" : "") });
			catPinBtn.title = isCatPinned ? "取消置顶分类" : "置顶分类";
			catPinBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>`;
			catPinBtn.addEventListener("click", () => {
				if (isCatPinned) {
					this.plugin.data.pinnedCategories = this.plugin.data.pinnedCategories.filter((c) => c !== cat.category);
				} else {
					this.plugin.data.pinnedCategories.push(cat.category);
				}
				this.plugin.saveSettings();
				this.renderView();
			});

			const catStats = this.calcStats(catEntries);
			catHeader.createEl("span", {
				cls: "pd-category-stats",
				text: `${catStats.completed}/${catStats.count} 已完成 · 平均 ${catStats.avg}%`,
			});

			const catList = catSection.createDiv("pd-list");
			for (const entry of sorted) {
				this.renderSkillRow(catList, entry, 0);
			}
		}
	}

	private flattenEntries(): SkillEntry[] {
		const result: SkillEntry[] = [];
		for (const e of this.entries) {
			if (e.parentName) continue;
			result.push(e);
			for (const child of e.children) {
				result.push(child);
			}
		}
		return result;
	}

	private renderStat(parent: HTMLElement, label: string, value: string, color: string) {
		const item = parent.createDiv("pd-stat-item");
		item.createEl("span", { cls: "pd-stat-label", text: label });
		const val = item.createEl("span", { cls: "pd-stat-value", text: value });
		val.style.color = color;
	}

	private renderSkillRow(parent: HTMLElement, entry: SkillEntry, depth: number) {
		const row = parent.createDiv("pd-row");
		if (depth > 0) row.addClass("pd-child-row");
		const skillKey = getSkillKey(entry.parentName, entry.name);
		/* 添加 data-skill-key 属性，便于 refreshParentUI 查找 */
		row.setAttribute("data-skill-key", skillKey);
		if (!entry.parentName) {
			row.setAttribute("data-is-parent", "true");
		}

		/* 左栏：技能名 */
		const colName = row.createDiv("pd-col-name");
		const titleRow = colName.createDiv("pd-skill-title-row");
		if (entry.children.length > 0) {
			const toggle = titleRow.createEl("span", { cls: "pd-toggle" });
			const isExpanded = this.expandedSkills.has(getSkillKey(entry.parentName, entry.name));
			toggle.innerHTML = isExpanded
				? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
				: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>`;
			toggle.addEventListener("click", (e) => {
				e.stopPropagation();
				const key = getSkillKey(entry.parentName, entry.name);
				if (this.expandedSkills.has(key)) {
					this.expandedSkills.delete(key);
				} else {
					this.expandedSkills.add(key);
				}
				this.renderView();
			});
		} else {
			titleRow.createEl("span", { cls: "pd-toggle-spacer" });
		}
		titleRow.createEl("span", { cls: "pd-skill-title", text: entry.name });

		/* 中栏：进度条 */
		const colBar = row.createDiv("pd-col-bar");
		const barTrack = colBar.createDiv("pd-bar-track");
		const barFill = barTrack.createDiv("pd-bar-fill");
		const pct = entry.progress;
		barFill.style.width = pct + "%";
		barFill.style.background = this.getGradientByProgress(pct);
		const handle = barTrack.createDiv("pd-bar-handle");
		handle.style.left = pct + "%";

		/* 先创建显示元素，避免在 updateProgress 中引用未定义的变量 */
		const pctEl = colBar.createDiv("pd-pct-inline");
		pctEl.setText(pct + "%");
		pctEl.style.color = this.getColorByProgress(pct);

		const levelBadge = colBar.createEl("span", { cls: "pd-level", text: this.getLevelText(pct) });
		levelBadge.className = "pd-level " + this.getLevelClass(pct);

		/* 同步更新 UI（拖动过程中调用，不做异步操作） */
		const updateUI = (clientX: number): number => {
			const rect = barTrack.getBoundingClientRect();
			if (rect.width === 0) return entry.progress;
			let ratio = (clientX - rect.left) / rect.width;
			ratio = Math.max(0, Math.min(1, ratio));
			const newProgress = Math.round(ratio * 100);
			barFill.style.width = newProgress + "%";
			handle.style.left = newProgress + "%";
			pctEl.setText(newProgress + "%");
			pctEl.style.color = this.getColorByProgress(newProgress);
			levelBadge.setText(this.getLevelText(newProgress));
			levelBadge.className = "pd-level " + this.getLevelClass(newProgress);
			entry.progress = newProgress;
			entry.manualProgress = newProgress;
			return newProgress;
		};

		/* 异步保存（仅在 mouseup 时调用一次） */
		const saveProgress = async (newProgress: number) => {
			const key = getSkillKey(entry.parentName, entry.name);
			console.log("[ProgressDashboard] saveProgress:", { 
				key, 
				entryName: entry.name, 
				parentName: entry.parentName, 
				newProgress,
				hasChildren: entry.children.length
			});
			this.plugin.data.manualProgress[key] = newProgress;
			if (!entry.parentName) {
				this.plugin.data.manualProgress[entry.name] = newProgress;
			} else {
				this.plugin.data.manualProgress[`${entry.parentName}/${entry.name}`] = newProgress;
			}
			/* 如果是父技能（有子技能），同步更新所有子技能的进度 */
			if (!entry.parentName && entry.children.length > 0) {
				for (const child of entry.children) {
					const childKey = getSkillKey(entry.name, child.name);
					this.plugin.data.manualProgress[childKey] = newProgress;
				}
			}
			if (entry.parentName) {
				this.updateParentProgress(entry.parentName);
				this.refreshParentUI(entry.parentName);
			}
			await this.plugin.saveSettings();
			console.log("[ProgressDashboard] manualProgress:", { ...this.plugin.data.manualProgress });
		};

		/* 拖动状态 */
		let isDragging = false;
		let rafId: number | null = null;
		let lastClientX = 0;

		barTrack.addEventListener("mousedown", (e) => {
			/* 只响应左键 */
			if (e.button !== 0) return;
			e.preventDefault();
			isDragging = true;
			lastClientX = e.clientX;
			updateUI(e.clientX);
		});

		const onMove = (e: MouseEvent) => {
			if (!isDragging) return;
			e.preventDefault();
			lastClientX = e.clientX;
			/* 使用 requestAnimationFrame 节流，避免频繁重绘 */
			if (rafId === null) {
				rafId = requestAnimationFrame(() => {
					rafId = null;
					updateUI(lastClientX);
				});
			}
		};

		const onUp = async (e: MouseEvent) => {
			if (!isDragging) return;
			isDragging = false;
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
				rafId = null;
			}
			const newProgress = updateUI(e.clientX);
			await saveProgress(newProgress);
		};

		document.addEventListener("mousemove", onMove, true);
		document.addEventListener("mouseup", onUp, true);

		/* 清理函数 */
		const cleanup = () => {
			document.removeEventListener("mousemove", onMove, true);
			document.removeEventListener("mouseup", onUp, true);
			const id = rafId;
			if (id !== null) cancelAnimationFrame(id);
		};
		if (!(this as any)._viewCleanup) (this as any)._viewCleanup = [];
		(this as any)._viewCleanup.push(cleanup);

		/* 右栏：笔记列表 + 操作 */
		const colNotes = row.createDiv("pd-col-notes");

		if (entry.files.length > 0) {
			for (const file of entry.files) {
				const noteChip = colNotes.createEl("span", { cls: "pd-note-chip" });
				
				/* 笔记名称 */
				noteChip.createEl("span", { cls: "pd-note-name", text: file.basename });
				
				/* 删除笔记按钮 */
				const removeBtn = noteChip.createEl("span", { cls: "pd-note-remove" });
				removeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
				removeBtn.title = "从技能中移除此笔记";
				
				removeBtn.addEventListener("click", async (e) => {
					e.stopPropagation();
					console.log("[ProgressDashboard] removeNote:", { skillKey, filePath: file.path, fileName: file.basename });
					
					/* 1. 从 attachedNotes 中移除（所有可能的 key） */
					const keysToCheck = [skillKey, entry.name];
					if (entry.parentName) keysToCheck.push(entry.parentName);
					
					for (const key of keysToCheck) {
						const paths = this.plugin.data.attachedNotes[key];
						if (paths) {
							const idx = paths.indexOf(file.path);
							if (idx > -1) {
								paths.splice(idx, 1);
								if (paths.length === 0) {
									delete this.plugin.data.attachedNotes[key];
								}
							}
						}
					}
					
					/* 同时检查所有 attachedNotes 中的引用 */
					for (const [k, v] of Object.entries(this.plugin.data.attachedNotes)) {
						if (!keysToCheck.includes(k)) {
							const i = v.indexOf(file.path);
							if (i > -1) {
								v.splice(i, 1);
								if (v.length === 0) {
									delete this.plugin.data.attachedNotes[k];
								}
							}
						}
					}
					
					/* 2. 添加到 excludedNotes，使用所有可能的 key */
					for (const key of keysToCheck) {
						const excluded = this.plugin.data.excludedNotes[key] || [];
						if (!excluded.includes(file.path)) {
							excluded.push(file.path);
						}
						this.plugin.data.excludedNotes[key] = excluded;
					}
					
					/* 同时用笔记中的 skill 字段作为 key 排除 */
					const cache = this.app.metadataCache.getFileCache(file);
					if (cache && cache.frontmatter && cache.frontmatter["skill"]) {
						const yamlSkill = String(cache.frontmatter["skill"]).trim();
						const yamlExcluded = this.plugin.data.excludedNotes[yamlSkill] || [];
						if (!yamlExcluded.includes(file.path)) {
							yamlExcluded.push(file.path);
							this.plugin.data.excludedNotes[yamlSkill] = yamlExcluded;
						}
					}
					
					console.log("[ProgressDashboard] excludedNotes after remove:", { ...this.plugin.data.excludedNotes });
					await this.plugin.saveSettings();
					this.renderView();
				});
				
				noteChip.title = "点击打开：" + file.path + "（右键移除）";
				noteChip.addEventListener("click", (e) => {
					if (e.target === removeBtn || removeBtn.contains(e.target as Node)) return;
					e.stopPropagation();
					this.app.workspace.getLeaf(true).openFile(file);
				});
			}
		}

		/* 操作按钮组 */
		const actionGroup = colNotes.createDiv("pd-action-group");

		/* 添加子技能按钮（仅父技能显示） */
		if (!entry.parentName) {
			const addChildBtn = actionGroup.createEl("span", { cls: "pd-add-child-btn" });
			addChildBtn.title = "添加子技能";
			addChildBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
			addChildBtn.style.display = "none";  /* 默认隐藏，悬停时显示 */
			
			/* 悬停父技能行时显示按钮 */
			row.addEventListener("mouseenter", () => {
				addChildBtn.style.display = "inline-flex";
			});
			row.addEventListener("mouseleave", () => {
				addChildBtn.style.display = "none";
			});
			
			addChildBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				const input = document.createElement("input");
				input.type = "text";
				input.placeholder = "输入子技能名称";
				input.style.padding = "6px 10px";
				input.style.borderRadius = "6px";
				input.style.border = "1px solid var(--interactive-accent)";
				input.style.background = "var(--background-secondary)";
				input.style.color = "var(--text-normal)";
				input.style.fontSize = "13px";
				input.style.width = "160px";
				
				/* 替换按钮为输入框 */
				actionGroup.replaceChild(input, addChildBtn);
				input.focus();
				
				const finishInput = (commit: boolean) => {
					const childName = input.value.trim();
					if (commit && childName) {
						const skillKey = getSkillKey(entry.name, childName);
						
						/* 检查是否已存在 */
						const exists = entry.children.some((c) => c.name === childName);
						if (exists) {
							new Notice("子技能已存在：" + childName);
						} else {
							/* 添加子技能 */
							const newChild: SkillEntry = {
								name: childName,
								desc: "",
								category: entry.category,
								progress: 0,
								manualProgress: null,
								noteProgress: null,
								files: [],
								hasNote: false,
								parentName: entry.name,
								children: [],
							};
							
							/* 更新或创建自定义技能记录（保存子技能列表） */
							let cs = this.plugin.data.customSkills.find((s) => s.name === entry.name);
							if (cs) {
								/* 已存在，更新描述 */
								const existingChildren = parseChildren(cs.desc) || [];
								if (!existingChildren.includes(childName)) {
									existingChildren.push(childName);
									cs.desc = existingChildren.join("、");
								}
							} else {
								/* 不存在，创建新的自定义技能记录（用于保存子技能列表） */
								this.plugin.data.customSkills.push({
									name: entry.name,
									desc: childName,
									category: entry.category,
								});
							}
							
							/* 确保父技能展开 */
							this.expandedSkills.add(getSkillKey(entry.parentName, entry.name));
							
							this.plugin.saveSettings();
							new Notice("已添加子技能：" + childName);
							this.renderView();
							return;
						}
					}
					/* 恢复按钮 */
					actionGroup.replaceChild(addChildBtn, input);
				};
				
				input.addEventListener("keydown", (ev) => {
					if (ev.key === "Enter") {
						ev.preventDefault();
						finishInput(true);
					} else if (ev.key === "Escape") {
						ev.preventDefault();
						finishInput(false);
					}
				});
				
				input.addEventListener("blur", () => {
					finishInput(true);
				});
			});
		}

		/* 创建笔记按钮（仅在没有笔记时显示） */
		if (entry.files.length === 0) {
			const createBtn = actionGroup.createEl("span", { cls: "pd-create-note-btn" });
			createBtn.title = "创建新笔记";
			createBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`;
			createBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				try {
					const fileName = entry.name + ".md";
					const existing = this.app.vault.getAbstractFileByPath(fileName);
					if (existing) {
						await this.app.workspace.getLeaf(true).openFile(existing as TFile);
						return;
					}
					const skillYaml = entry.parentName
						? `${entry.parentName}/${entry.name}`
						: entry.name;
					const frontmatter = `---\nskill: ${skillYaml}\nskill-progress: ${entry.progress}\n---\n\n# ${entry.name}\n\n> 分类：${entry.category}\n> 描述：${entry.desc}\n\n## 学习记录\n\n`;
					const newFile = await this.app.vault.create(fileName, frontmatter);
					await this.app.workspace.getLeaf(true).openFile(newFile);
					this.renderView();
				} catch (err) {
					new Notice("创建笔记失败: " + String(err));
				}
			});
		}

		/* 添加已有笔记按钮 */
		const attachBtn = actionGroup.createEl("span", { cls: "pd-attach-btn" });
		attachBtn.title = "添加已有笔记";
		attachBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
		attachBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			new PickNoteModal(this.app, this.plugin, skillKey, () => {
				this.renderView();
			}).open();
		});

		/* 日期按钮 */
		const startDate = this.plugin.data.skillStartDates[skillKey];
		const endDate = this.plugin.data.skillEndDates[skillKey];
		
		const createDateBtn = (
			type: "start" | "end",
			value: string | undefined,
			title: string,
			icon: string
		) => {
			const btn = actionGroup.createEl("span", { cls: "pd-date-btn" });
			btn.title = title;
			const dateText = value ? `<span class="pd-date-text">${value.slice(5)}</span>` : "";
			btn.innerHTML = dateText + icon;
			
			btn.addEventListener("click", (e) => {
				e.stopPropagation();
				const input = document.createElement("input");
				input.type = "date";
				input.value = value || "";
				input.style.position = "absolute";
				input.style.opacity = "0";
				input.style.pointerEvents = "none";
				btn.appendChild(input);
				(input as any).showPicker();
				input.addEventListener("change", async () => {
					if (type === "start") {
						if (input.value) {
							this.plugin.data.skillStartDates[skillKey] = input.value;
						} else {
							delete this.plugin.data.skillStartDates[skillKey];
						}
					} else {
						if (input.value) {
							this.plugin.data.skillEndDates[skillKey] = input.value;
						} else {
							delete this.plugin.data.skillEndDates[skillKey];
						}
					}
					await this.plugin.saveSettings();
					this.renderView();
				});
				input.addEventListener("blur", () => input.remove());
			});
			return btn;
		};
		
		const startIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
		const endIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
		
		createDateBtn("start", startDate, startDate ? "修改开始日期" : "添加开始日期", startIcon);
		createDateBtn("end", endDate, endDate ? "修改结束日期" : "添加结束日期", endIcon);

		/* 删除按钮 */
		const delBtn = actionGroup.createEl("span", { cls: "pd-del-btn" });
		delBtn.title = "删除此技能";
		delBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`;
		delBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			const skillK = getSkillKey(entry.parentName, entry.name);
			const keysToDelete = [skillK];
			
			/* 如果是父技能，同时删除所有子技能 */
			if (entry.children.length > 0) {
				for (const child of entry.children) {
					const childKey = getSkillKey(entry.name, child.name);
					keysToDelete.push(childKey);
				}
			}
			
			for (const key of keysToDelete) {
				if (!this.plugin.data.deletedSkills.includes(key)) {
					this.plugin.data.deletedSkills.push(key);
				}
			}
			
			/* 清理进度数据 */
			const newProgress: Record<string, number> = {};
			for (const [k, v] of Object.entries(this.plugin.data.manualProgress)) {
				if (!keysToDelete.includes(k)) {
					newProgress[k] = v;
				}
			}
			this.plugin.data.manualProgress = newProgress;
			
			/* 清理关联笔记数据 */
			const newAttached: Record<string, string[]> = {};
			for (const [k, v] of Object.entries(this.plugin.data.attachedNotes)) {
				if (!keysToDelete.includes(k)) {
					newAttached[k] = v;
				}
			}
			this.plugin.data.attachedNotes = newAttached;
			
			/* 清理日期数据 */
			const newStartDates: Record<string, string> = {};
			for (const [k, v] of Object.entries(this.plugin.data.skillStartDates)) {
				if (!keysToDelete.includes(k)) {
					newStartDates[k] = v;
				}
			}
			this.plugin.data.skillStartDates = newStartDates;
			
			const newEndDates: Record<string, string> = {};
			for (const [k, v] of Object.entries(this.plugin.data.skillEndDates)) {
				if (!keysToDelete.includes(k)) {
					newEndDates[k] = v;
				}
			}
			this.plugin.data.skillEndDates = newEndDates;
			
			/* 如果是自定义技能的父技能，删除自定义技能记录 */
			const isCustomSkill = this.plugin.data.customSkills.some((cs) => cs.name === entry.name);
			if (isCustomSkill && !entry.parentName) {
				this.plugin.data.customSkills = this.plugin.data.customSkills.filter(
					(cs) => cs.name !== entry.name
				);
			}
			
			this.plugin.saveSettings();
			this.renderView();
		});

		/* 展开子技能 */
		if (entry.children.length > 0) {
			const key = getSkillKey(entry.parentName, entry.name);
			const isExpanded = this.expandedSkills.has(key);
			if (isExpanded) {
				const childContainer = parent.createDiv("pd-children");
				for (const child of entry.children) {
					this.renderSkillRow(childContainer, child, depth + 1);
				}
			}
		}
	}

	private getLevelText(pct: number): string {
		if (pct >= 100) return "已完成";
		if (pct >= 67) return "冲刺中";
		if (pct >= 34) return "进行中";
		if (pct > 0) return "刚起步";
		return "未开始";
	}

	private getLevelClass(pct: number): string {
		if (pct >= 100) return "pd-level-done";
		if (pct >= 67) return "pd-level-high";
		if (pct >= 34) return "pd-level-mid";
		if (pct > 0) return "pd-level-low";
		return "pd-level-none";
	}

	private updateParentProgress(parentName: string) {
		const parent = this.entries.find((e) => e.name === parentName && !e.parentName);
		if (!parent || parent.children.length === 0) return;
		const total = parent.children.reduce((sum, c) => sum + c.progress, 0);
		const avg = Math.round(total / parent.children.length);
		parent.progress = avg;
	}

	/* 拖动子技能时，实时更新父技能的进度条 UI（不重新渲染整个视图） */
	private refreshParentUI(parentName: string) {
		const parent = this.entries.find((e) => e.name === parentName && !e.parentName);
		if (!parent) return;
		/* 通过 DOM 查找父技能的进度条元素 */
		const parentRow = this.contentEl.querySelector(`[data-skill-key="${CSS.escape(parentName)}"][data-is-parent="true"]`);
		if (!parentRow) return;
		const barFill = parentRow.querySelector(".pd-bar-fill") as HTMLElement;
		const handle = parentRow.querySelector(".pd-bar-handle") as HTMLElement;
		const pctEl = parentRow.querySelector(".pd-pct-inline") as HTMLElement;
		const levelBadge = parentRow.querySelector(".pd-level") as HTMLElement;
		const pct = parent.progress;
		if (barFill) {
			barFill.style.width = pct + "%";
			barFill.style.background = this.getGradientByProgress(pct);
		}
		if (handle) handle.style.left = pct + "%";
		if (pctEl) {
			pctEl.setText(pct + "%");
			pctEl.style.color = this.getColorByProgress(pct);
		}
		if (levelBadge) {
			levelBadge.setText(this.getLevelText(pct));
			levelBadge.className = "pd-level " + this.getLevelClass(pct);
		}
	}

	private buildEntries(): SkillEntry[] {
		const noteMap = new Map<string, { progress: number; files: TFile[]; hasExplicitProgress: boolean }>();
		const appAny = this.app as any;
		const vaults = [this.app.vault];
		if (appAny.vaults && Array.isArray(appAny.vaults)) {
			for (const v of appAny.vaults) {
				if (v !== this.app.vault) vaults.push(v);
			}
		}
		let allFiles: TFile[] = [];
		for (const v of vaults) {
			allFiles = allFiles.concat(v.getMarkdownFiles());
		}

		/* 扫描笔记 YAML skill 字段 */
		for (const file of allFiles) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache || !cache.frontmatter) continue;

			const skill = cache.frontmatter["skill"];
			if (!skill) continue;

			const skillName = String(skill).trim();
			if (!skillName) continue;

			/* 检查这个笔记是否被用户排除（从技能中删除） */
			const excludedPaths = this.plugin.data.excludedNotes[skillName];
			if (excludedPaths && excludedPaths.includes(file.path)) continue;

			const progressRaw = cache.frontmatter["skill-progress"];
			let progressNum = 0;
			let hasProgress = false;
			if (progressRaw !== undefined && progressRaw !== null) {
				const parsed = Number(progressRaw);
				if (!isNaN(parsed)) {
					progressNum = Math.max(0, Math.min(100, parsed));
					hasProgress = true;
				}
			}

			const existing = noteMap.get(skillName);
			if (existing) {
				existing.files.push(file);
				if (hasProgress) {
					existing.progress = progressNum;
					existing.hasExplicitProgress = true;
				}
			} else {
				noteMap.set(skillName, { progress: progressNum, files: [file], hasExplicitProgress: hasProgress });
			}
		}

		for (const [key, paths] of Object.entries(this.plugin.data.attachedNotes)) {
			let attFiles: TFile[] = [];
			const excludedPaths = this.plugin.data.excludedNotes[key] || [];
			for (const p of paths) {
				/* 跳过被排除的笔记 */
				if (excludedPaths.includes(p)) continue;
				const f = this.app.vault.getAbstractFileByPath(p);
				if (f && f instanceof TFile) attFiles.push(f);
			}
			if (attFiles.length === 0) continue;
			const existing = noteMap.get(key);
			if (existing) {
				for (const f of attFiles) {
					if (!existing.files.some((ef) => ef.path === f.path)) {
						existing.files.push(f);
					}
				}
			} else {
				noteMap.set(key, { progress: 0, files: attFiles, hasExplicitProgress: false });
			}
		}

		const collectNoteData = (keys: string[]): { progress: number; files: TFile[]; hasExplicitProgress: boolean } | null => {
			let latest: { progress: number; file: TFile; hasExplicitProgress: boolean } | null = null;
			const allFiles: TFile[] = [];
			let anyHasExplicit = false;
			let maxProgress = 0;
			for (const key of keys) {
				const data = noteMap.get(key);
				if (data) {
					for (const f of data.files) {
						if (!allFiles.some((af) => af.path === f.path)) {
							allFiles.push(f);
						}
					}
					if (data.hasExplicitProgress) {
						anyHasExplicit = true;
						if (data.progress > maxProgress) maxProgress = data.progress;
					}
					if (!latest || data.files[data.files.length - 1].stat.mtime > latest.file.stat.mtime) {
						latest = { progress: data.progress, file: data.files[data.files.length - 1], hasExplicitProgress: data.hasExplicitProgress };
					}
				}
			}
			if (allFiles.length === 0) return null;
			/* 只有笔记明确写了 skill-progress 才有进度；否则进度为 0（不影响手动进度） */
			return { progress: anyHasExplicit ? maxProgress : 0, files: allFiles, hasExplicitProgress: anyHasExplicit };
		};

		const deletedSet = new Set(this.plugin.data.deletedSkills);

		const entries: SkillEntry[] = [];

		/* 先处理自定义技能，确保子技能被添加到 entries 中，
		   这样后面检查 noteMap 时才能正确匹配已存在的子技能 */
		for (const cs of this.plugin.data.customSkills) {
			const csKey = getSkillKey(null, cs.name);
			if (deletedSet.has(csKey)) continue;
			const exists = entries.some((e) => e.name === cs.name && !e.parentName);
			if (exists) continue;
			const childrenNames = parseChildren(cs.desc);
			if (childrenNames) {
				const childEntries: SkillEntry[] = childrenNames.map((childName): SkillEntry | null => {
					const childKey = getSkillKey(cs.name, childName);
					if (deletedSet.has(childKey)) return null;
					const noteData = collectNoteData([childKey, childName]);
					/* 只用完整的 childKey 查找手动进度，避免匹配到其他父技能下的同名子技能 */
					const manual = this.plugin.data.manualProgress[childKey];
					let progress = 0;
					if (manual !== undefined) progress = manual;
					else if (noteData && noteData.hasExplicitProgress) progress = noteData.progress;
					return {
						name: childName,
						desc: "",
						category: cs.category,
						progress,
						manualProgress: manual !== undefined ? manual : null,
						noteProgress: noteData ? noteData.progress : null,
						files: noteData ? noteData.files : [],
						hasNote: !!noteData,
						parentName: cs.name,
						children: [],
					};
				}).filter((c): c is SkillEntry => c !== null);
				const total = childEntries.reduce((sum, c) => sum + c.progress, 0);
				const avg = childEntries.length > 0 ? Math.round(total / childEntries.length) : 0;
				const csManual = this.plugin.data.manualProgress[cs.name];
				entries.push({
					name: cs.name,
					desc: cs.desc,
					category: cs.category,
					progress: csManual !== undefined ? csManual : avg,
					manualProgress: csManual !== undefined ? csManual : null,
					noteProgress: null,
					files: [],
					hasNote: false,
					parentName: null,
					children: childEntries,
				});
			} else {
				const noteData = collectNoteData([cs.name]);
				const manual = this.plugin.data.manualProgress[cs.name];
				let progress = 0;
				if (manual !== undefined) {
					progress = manual;
				} else if (noteData && noteData.hasExplicitProgress) {
					progress = noteData.progress;
				}
				entries.push({
					name: cs.name,
					desc: cs.desc,
					category: cs.category,
					progress: progress,
					manualProgress: manual !== undefined ? manual : null,
					noteProgress: noteData ? noteData.progress : null,
					files: noteData ? noteData.files : [],
					hasNote: !!noteData,
					parentName: null,
					children: [],
				});
			}
		}

		/* 处理 noteMap 中的技能（通过笔记 YAML skill 字段关联）
		   注意：笔记关联只会更新已存在的技能，不会创建新技能 */
		for (const [skillName, data] of noteMap) {
			if (deletedSet.has(skillName)) continue;
			
			/* 查找已存在的技能 */
			let targetEntry: SkillEntry | null = null;
			let isChild = false;
			
			/* 直接匹配：e.name === skillName */
			targetEntry = entries.find((e) => e.name === skillName && !e.parentName) || null;
			
			/* 如果没找到，尝试作为子技能匹配 */
			if (!targetEntry) {
				for (const e of entries) {
					if (e.children.length > 0) {
						const child = e.children.find((c) => getSkillKey(e.name, c.name) === skillName);
						if (child) {
							targetEntry = child;
							isChild = true;
							break;
						}
						/* 尝试用 skillName 中的子技能名匹配 */
						const parts = skillName.split("/");
						if (parts.length > 1 && e.name === parts[0]) {
							const childName = parts.slice(1).join("/");
							const childMatch = e.children.find((c) => c.name === childName);
							if (childMatch) {
								targetEntry = childMatch;
								isChild = true;
								break;
							}
						}
					}
				}
			}
			
			/* 只有找到已存在的技能才更新 */
			if (targetEntry) {
				targetEntry.files = data.files;
				targetEntry.hasNote = true;
				if (data.hasExplicitProgress) {
					targetEntry.noteProgress = data.progress;
				}
				/* 如果没有手动进度，使用笔记进度 */
				if (targetEntry.manualProgress === null && data.hasExplicitProgress) {
					targetEntry.progress = data.progress;
				}
				
				/* 如果是父技能，更新子技能的平均进度 */
				if (!isChild && targetEntry.children.length > 0) {
					const total = targetEntry.children.reduce((sum, c) => sum + c.progress, 0);
					targetEntry.progress = targetEntry.manualProgress !== null ? targetEntry.manualProgress : Math.round(total / targetEntry.children.length);
				}
			}
			/* 如果技能不存在，跳过（不创建新技能） */
		}

		return entries;
	}

	private getAllCategories(): { category: string }[] {
		const cats: { category: string }[] = [];
		for (const cs of this.plugin.data.customSkills) {
			if (!cats.some((c) => c.category === cs.category)) {
				cats.push({ category: cs.category });
			}
		}
		if (this.entries.some((e) => e.category === "其他")) {
			if (!cats.some((c) => c.category === "其他")) {
				cats.push({ category: "其他" });
			}
		}
		return cats;
	}

	private calcStats(entries: SkillEntry[]) {
		const count = entries.length;
		const total = entries.reduce((sum, e) => sum + e.progress, 0);
		const avg = count > 0 ? Math.round(total / count) : 0;
		const completed = entries.filter((e) => e.progress >= 100).length;
		const inProgress = entries.filter((e) => e.progress >= 34 && e.progress < 100).length;
		const started = entries.filter((e) => e.progress > 0 && e.progress < 34).length;
		const notStarted = entries.filter((e) => e.progress === 0).length;
		return { count, avg, completed, inProgress, started, notStarted };
	}

	private sortEntries(entries: SkillEntry[], mode: SortMode): SkillEntry[] {
		const arr = [...entries];
		switch (mode) {
			case "progress-desc":
				arr.sort((a, b) => b.progress - a.progress);
				break;
			case "progress-asc":
				arr.sort((a, b) => a.progress - b.progress);
				break;
			case "name-asc":
				arr.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
				break;
		}
		return arr;
	}

	private getColorByProgress(p: number): string {
		if (p >= 100) return "#00e676";
		if (p >= 67) return "#00b0ff";
		if (p >= 34) return "#ffc107";
		if (p > 0) return "#ff9100";
		return "var(--text-faint)";
	}

	private getGradientByProgress(p: number): string {
		if (p >= 100) return "linear-gradient(90deg, #00c853, #00e676)";
		if (p >= 67) return "linear-gradient(90deg, #0091ea, #00b0ff, #40c4ff)";
		if (p >= 34) return "linear-gradient(90deg, #ffa000, #ffc107, #ffe082)";
		if (p > 0) return "linear-gradient(90deg, #e65100, #ff9100, #ffab40)";
		return "transparent";
	}
}

/* ===== 确认弹窗 ===== */
class ConfirmModal extends Modal {
	private title: string;
	private message: string;
	private onConfirm: () => void;

	constructor(app: App, title: string, message: string, onConfirm: () => void) {
		super(app);
		this.title = title;
		this.message = message;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("pd-modal");
		contentEl.createEl("h3", { text: this.title });

		const msgEl = contentEl.createEl("div");
		msgEl.style.marginBottom = "20px";
		msgEl.style.whiteSpace = "pre-line";
		msgEl.style.color = "var(--text-normal)";
		msgEl.style.fontSize = "14px";
		msgEl.textContent = this.message;

		const btnRow = contentEl.createDiv("pd-modal-btns");
		btnRow.style.display = "flex";
		btnRow.style.justifyContent = "flex-end";
		btnRow.style.gap = "10px";

		const cancelBtn = btnRow.createEl("button", { text: "取消" });
		cancelBtn.style.padding = "8px 16px";
		cancelBtn.style.borderRadius = "6px";
		cancelBtn.style.border = "1px solid var(--background-modifier-border)";
		cancelBtn.style.background = "var(--background-secondary)";
		cancelBtn.style.color = "var(--text-normal)";
		cancelBtn.style.cursor = "pointer";
		cancelBtn.addEventListener("click", () => this.close());

		const confirmBtn = btnRow.createEl("button", { text: "确定", cls: "mod-cta" });
		confirmBtn.style.padding = "8px 20px";
		confirmBtn.style.borderRadius = "6px";
		confirmBtn.style.border = "none";
		confirmBtn.style.background = "var(--interactive-accent)";
		confirmBtn.style.color = "var(--text-on-accent)";
		confirmBtn.style.fontWeight = "600";
		confirmBtn.style.cursor = "pointer";
		confirmBtn.addEventListener("click", () => {
			this.onConfirm();
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

/* ===== 添加技能弹窗 ===== */
class AddSkillModal extends Modal {
	private onSubmit: (name: string, desc: string, category: string) => void;
	private nameInput!: HTMLInputElement;
	private descInput!: HTMLInputElement;
	private categoryInput!: HTMLInputElement;

	constructor(
		app: App,
		onSubmit: (name: string, desc: string, category: string) => void
	) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("pd-modal");
		contentEl.createEl("h3", { text: "添加技能" });

		/* 分类输入 */
		const catRow = contentEl.createDiv("pd-form-row");
		catRow.style.marginBottom = "16px";
		catRow.createEl("label", { text: "分类" }).style.display = "block";
		this.categoryInput = catRow.createEl("input", {
			type: "text",
			placeholder: "输入分类名称，如：技术、学习、生活",
		});
		this.categoryInput.style.width = "100%";
		this.categoryInput.style.padding = "8px 12px";
		this.categoryInput.style.borderRadius = "6px";
		this.categoryInput.style.border = "1px solid var(--background-modifier-border)";
		this.categoryInput.style.background = "var(--background-secondary)";
		this.categoryInput.style.color = "var(--text-normal)";
		this.categoryInput.style.fontSize = "14px";
		this.categoryInput.style.boxSizing = "border-box";

		/* 技能名称 */
		const nameRow = contentEl.createDiv("pd-form-row");
		nameRow.style.marginBottom = "16px";
		nameRow.createEl("label", { text: "技能名称" }).style.display = "block";
		this.nameInput = nameRow.createEl("input", {
			type: "text",
			placeholder: "输入技能/项目名称",
		});
		this.nameInput.style.width = "100%";
		this.nameInput.style.padding = "8px 12px";
		this.nameInput.style.borderRadius = "6px";
		this.nameInput.style.border = "1px solid var(--background-modifier-border)";
		this.nameInput.style.background = "var(--background-secondary)";
		this.nameInput.style.color = "var(--text-normal)";
		this.nameInput.style.fontSize = "14px";
		this.nameInput.style.boxSizing = "border-box";
		this.nameInput.addEventListener("input", () => {
			/* 实时更新，不再依赖 onChange */
		});

		/* 技能描述 */
		const descRow = contentEl.createDiv("pd-form-row");
		descRow.style.marginBottom = "20px";
		descRow.createEl("label", { text: "技能描述" }).style.display = "block";
		const descHint = descRow.createEl("div", { text: "简要描述（可选）。用顿号/逗号分隔可拆为子技能" });
		descHint.style.fontSize = "12px";
		descHint.style.color = "var(--text-faint)";
		this.descInput = descRow.createEl("input", {
			type: "text",
			placeholder: "简要描述...",
		});
		this.descInput.style.width = "100%";
		this.descInput.style.padding = "8px 12px";
		this.descInput.style.borderRadius = "6px";
		this.descInput.style.border = "1px solid var(--background-modifier-border)";
		this.descInput.style.background = "var(--background-secondary)";
		this.descInput.style.color = "var(--text-normal)";
		this.descInput.style.fontSize = "14px";
		this.descInput.style.boxSizing = "border-box";

		/* 按钮 */
		const btnRow = contentEl.createDiv("pd-modal-btns");
		btnRow.style.display = "flex";
		btnRow.style.justifyContent = "flex-end";
		btnRow.style.gap = "10px";

		const cancelBtn = btnRow.createEl("button", { text: "取消" });
		cancelBtn.style.padding = "8px 16px";
		cancelBtn.style.borderRadius = "6px";
		cancelBtn.style.border = "1px solid var(--background-modifier-border)";
		cancelBtn.style.background = "var(--background-secondary)";
		cancelBtn.style.color = "var(--text-normal)";
		cancelBtn.style.cursor = "pointer";
		cancelBtn.addEventListener("click", () => this.close());

		const submitBtn = btnRow.createEl("button", {
			text: "添加",
			cls: "mod-cta",
		});
		submitBtn.style.padding = "8px 20px";
		submitBtn.style.borderRadius = "6px";
		submitBtn.style.border = "none";
		submitBtn.style.background = "var(--interactive-accent)";
		submitBtn.style.color = "var(--text-on-accent)";
		submitBtn.style.fontWeight = "600";
		submitBtn.style.cursor = "pointer";
		submitBtn.addEventListener("click", () => {
			const name = this.nameInput.value.trim();
			const desc = this.descInput.value.trim() || "自定义技能";
			const category = this.categoryInput.value.trim() || "自定义技能";
			
			if (!name) {
				new Notice("请输入技能名称");
				this.nameInput.focus();
				return;
			}
			this.onSubmit(name, desc, category);
			this.close();
		});

		/* 支持 Enter 键提交 */
		this.nameInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				submitBtn.click();
			}
		});
		this.descInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				submitBtn.click();
			}
		});

		this.nameInput.focus();
	}

	onClose() {
		this.contentEl.empty();
	}
}

/* ===== 选择笔记弹窗 ===== */
type PickSortMode = "name" | "time-desc" | "time-asc";

class PickNoteModal extends Modal {
	private plugin: ProgressDashboardPlugin;
	private skillKey: string;
	private onPicked: () => void;
	private searchInput!: HTMLInputElement;
	private listEl!: HTMLElement;
	private allFiles: TFile[] = [];
	private sortMode: PickSortMode = "time-desc";
	private groupByFolder: boolean = true;
	private folderGroups: Map<string, TFile[]> = new Map();
	private folderToggleState: Set<string> = new Set();
	private selectedPaths: Set<string> = new Set();
	private footerEl!: HTMLElement;
	private confirmBtn!: HTMLElement;
	private lastClickedPath: string | null = null;
	private currentVisibleFiles: TFile[] = [];

	constructor(
		app: App,
		plugin: ProgressDashboardPlugin,
		skillKey: string,
		onPicked: () => void
	) {
		super(app);
		this.plugin = plugin;
		this.skillKey = skillKey;
		this.onPicked = onPicked;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("pd-modal");
		contentEl.createEl("h3", { text: "添加已有笔记到技能" });

		/* 工具栏 */
		const toolbar = contentEl.createDiv("pd-pick-toolbar");
		toolbar.style.display = "flex";
		toolbar.style.alignItems = "center";
		toolbar.style.gap = "8px";
		toolbar.style.marginBottom = "10px";
		toolbar.style.flexWrap = "wrap";

		/* 搜索框 */
		this.searchInput = toolbar.createEl("input", {
			type: "text",
			placeholder: "搜索笔记名称或路径...",
			cls: "pd-pick-search",
		});
		this.searchInput.style.flex = "1";
		this.searchInput.style.minWidth = "150px";
		this.searchInput.style.padding = "6px 10px";
		this.searchInput.style.borderRadius = "6px";
		this.searchInput.style.border = "1px solid var(--background-modifier-border)";
		this.searchInput.style.background = "var(--background-secondary)";
		this.searchInput.style.color = "var(--text-normal)";
		this.searchInput.style.fontSize = "13px";
		this.searchInput.style.boxSizing = "border-box";

		/* 排序选项 */
		const sortLabel = toolbar.createEl("span", { text: "排序：" });
		sortLabel.style.fontSize = "12px";
		sortLabel.style.color = "var(--text-faint)";
		const sortSelect = toolbar.createEl("select");
		sortSelect.style.padding = "5px 8px";
		sortSelect.style.borderRadius = "6px";
		sortSelect.style.border = "1px solid var(--background-modifier-border)";
		sortSelect.style.background = "var(--background-secondary)";
		sortSelect.style.color = "var(--text-normal)";
		sortSelect.style.fontSize = "12px";
		sortSelect.style.cursor = "pointer";
		const opt1 = document.createElement("option");
		opt1.value = "time-desc";
		opt1.text = "修改时间↓";
		sortSelect.add(opt1);
		const opt2 = document.createElement("option");
		opt2.value = "time-asc";
		opt2.text = "修改时间↑";
		sortSelect.add(opt2);
		const opt3 = document.createElement("option");
		opt3.value = "name";
		opt3.text = "名称排序";
		sortSelect.add(opt3);
		sortSelect.value = this.sortMode;
		sortSelect.addEventListener("change", () => {
			this.sortMode = sortSelect.value as PickSortMode;
			this.buildFolderGroups();
			this.renderList(this.searchInput.value.toLowerCase().trim());
		});

		/* 分组开关 */
		const groupLabel = toolbar.createEl("span", { text: "按文件夹分组" });
		groupLabel.style.fontSize = "12px";
		groupLabel.style.color = "var(--text-faint)";
		groupLabel.style.display = "flex";
		groupLabel.style.alignItems = "center";
		groupLabel.style.gap = "4px";
		const groupCheckbox = toolbar.createEl("input", { type: "checkbox" });
		groupCheckbox.checked = this.groupByFolder;
		groupCheckbox.style.cursor = "pointer";
		groupCheckbox.addEventListener("change", () => {
			this.groupByFolder = groupCheckbox.checked;
			if (this.groupByFolder) this.buildFolderGroups();
			this.renderList(this.searchInput.value.toLowerCase().trim());
		});

		/* 全选按钮 */
		const selectAllBtn = toolbar.createEl("button", { text: "全选" });
		selectAllBtn.style.padding = "4px 10px";
		selectAllBtn.style.borderRadius = "6px";
		selectAllBtn.style.border = "1px solid var(--background-modifier-border)";
		selectAllBtn.style.background = "var(--background-secondary)";
		selectAllBtn.style.color = "var(--text-normal)";
		selectAllBtn.style.fontSize = "12px";
		selectAllBtn.style.cursor = "pointer";
		selectAllBtn.title = "全选当前显示的笔记";
		selectAllBtn.addEventListener("click", () => {
			for (const f of this.currentVisibleFiles) {
				const existing = this.plugin.data.attachedNotes[this.skillKey] || [];
				if (!existing.includes(f.path)) {
					this.selectedPaths.add(f.path);
				}
			}
			this.renderList(this.searchInput.value.toLowerCase().trim());
		});

		/* 反选按钮 */
		const invertBtn = toolbar.createEl("button", { text: "反选" });
		invertBtn.style.padding = "4px 10px";
		invertBtn.style.borderRadius = "6px";
		invertBtn.style.border = "1px solid var(--background-modifier-border)";
		invertBtn.style.background = "var(--background-secondary)";
		invertBtn.style.color = "var(--text-normal)";
		invertBtn.style.fontSize = "12px";
		invertBtn.style.cursor = "pointer";
		invertBtn.title = "反选当前显示的笔记";
		invertBtn.addEventListener("click", () => {
			for (const f of this.currentVisibleFiles) {
				const existing = this.plugin.data.attachedNotes[this.skillKey] || [];
				if (existing.includes(f.path)) continue;
				if (this.selectedPaths.has(f.path)) {
					this.selectedPaths.delete(f.path);
				} else {
					this.selectedPaths.add(f.path);
				}
			}
			this.renderList(this.searchInput.value.toLowerCase().trim());
		});

		/* 列表容器 */
		this.listEl = contentEl.createDiv("pd-pick-list");
		this.listEl.style.maxHeight = "400px";
		this.listEl.style.overflowY = "auto";
		this.listEl.style.border = "1px solid var(--background-modifier-border)";
		this.listEl.style.borderRadius = "8px";
		this.listEl.style.background = "var(--background-primary)";

		this.collectFiles();
		if (this.groupByFolder) this.buildFolderGroups();
		
		/* 底部按钮区域 */
		this.footerEl = contentEl.createDiv("pd-pick-footer");
		this.footerEl.style.display = "flex";
		this.footerEl.style.alignItems = "center";
		this.footerEl.style.justifyContent = "space-between";
		this.footerEl.style.marginTop = "10px";
		this.footerEl.style.padding = "10px";
		this.footerEl.style.background = "var(--background-secondary)";
		this.footerEl.style.borderRadius = "8px";
		
		const selectInfo = this.footerEl.createEl("span");
		selectInfo.style.fontSize = "12px";
		selectInfo.style.color = "var(--text-faint)";
		selectInfo.textContent = "已选择 0 个笔记";
		
		const btnContainer = this.footerEl.createDiv();
		btnContainer.style.display = "flex";
		btnContainer.style.gap = "8px";
		
		const clearBtn = btnContainer.createEl("button", { text: "清空选择" });
		clearBtn.style.padding = "6px 12px";
		clearBtn.style.borderRadius = "6px";
		clearBtn.style.border = "1px solid var(--background-modifier-border)";
		clearBtn.style.background = "var(--background-primary)";
		clearBtn.style.color = "var(--text-faint)";
		clearBtn.style.fontSize = "12px";
		clearBtn.style.cursor = "pointer";
		clearBtn.addEventListener("click", () => {
			this.selectedPaths.clear();
			this.renderList(this.searchInput.value.toLowerCase().trim());
		});
		
		this.confirmBtn = btnContainer.createEl("button", { text: "确认添加 (0)" });
		this.confirmBtn.style.padding = "6px 16px";
		this.confirmBtn.style.borderRadius = "6px";
		this.confirmBtn.style.border = "none";
		this.confirmBtn.style.background = "var(--interactive-accent)";
		this.confirmBtn.style.color = "var(--text-on-accent)";
		this.confirmBtn.style.fontSize = "13px";
		this.confirmBtn.style.fontWeight = "600";
		this.confirmBtn.style.cursor = "pointer";
		this.confirmBtn.style.opacity = "0.5";
		this.confirmBtn.addEventListener("click", () => {
			if (this.selectedPaths.size === 0) return;
			const current = this.plugin.data.attachedNotes[this.skillKey] || [];
			let added = 0;
			for (const path of this.selectedPaths) {
				if (!current.includes(path)) {
					current.push(path);
					added++;
				}
			}
			this.plugin.data.attachedNotes[this.skillKey] = current;
			this.plugin.saveSettings();
			new Notice(`已关联 ${added} 个笔记`);
			this.onPicked();
			this.close();
		});
		
		this.renderList("");
		this.updateFooter();

		this.searchInput.addEventListener("input", () => {
			this.renderList(this.searchInput.value.toLowerCase().trim());
		});

		this.searchInput.focus();
	}

	private updateFooter() {
		const count = this.selectedPaths.size;
		const info = this.footerEl.querySelector("span");
		if (info) {
			info.textContent = `已选择 ${count} 个笔记`;
		}
		this.confirmBtn.textContent = `确认添加 (${count})`;
		this.confirmBtn.style.opacity = count > 0 ? "1" : "0.5";
	}

	private collectFiles() {
		const appAny = this.app as any;
		const vaults = [this.app.vault];
		if (appAny.vaults && Array.isArray(appAny.vaults)) {
			for (const v of appAny.vaults) {
				if (v !== this.app.vault) vaults.push(v);
			}
		}
		for (const v of vaults) {
			this.allFiles = this.allFiles.concat(v.getMarkdownFiles());
		}
	}

	private buildFolderGroups() {
		this.folderGroups.clear();
		for (const file of this.allFiles) {
			const parts = file.path.split("/");
			const folderPath = parts.length > 1 ? parts.slice(0, -1).join("/") : "/";
			if (!this.folderGroups.has(folderPath)) {
				this.folderGroups.set(folderPath, []);
			}
			this.folderGroups.get(folderPath)!.push(file);
		}
		/* 对每组文件进行排序 */
		for (const [, files] of this.folderGroups) {
			this.sortFiles(files);
		}
	}

	private sortFiles(files: TFile[]) {
		switch (this.sortMode) {
			case "time-desc":
				files.sort((a, b) => b.stat.mtime - a.stat.mtime);
				break;
			case "time-asc":
				files.sort((a, b) => a.stat.mtime - b.stat.mtime);
				break;
			case "name":
				files.sort((a, b) => a.basename.localeCompare(b.basename, "zh-CN"));
				break;
		}
	}

	private hasSkillProperty(file: TFile): boolean {
		const cache = this.app.metadataCache.getFileCache(file);
		return !!(cache && cache.frontmatter && cache.frontmatter["skill"]);
	}

	private formatDate(timestamp: number): string {
		const date = new Date(timestamp * 1000);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const oneDay = 24 * 60 * 60 * 1000;
		if (diff < oneDay) return "今天";
		if (diff < 2 * oneDay) return "昨天";
		if (diff < 7 * oneDay) return `${Math.floor(diff / oneDay)}天前`;
		return `${date.getMonth() + 1}/${date.getDate()}`;
	}

	private renderList(query: string) {
		this.listEl.empty();
		const existingPaths = new Set(this.plugin.data.attachedNotes[this.skillKey] || []);

		/* 过滤文件 */
		let filtered: TFile[];
		if (query) {
			filtered = this.allFiles.filter(
				(f) => f.basename.toLowerCase().includes(query) || f.path.toLowerCase().includes(query)
			);
			this.sortFiles(filtered);
		} else {
			filtered = [...this.allFiles];
		}

		if (filtered.length === 0) {
			this.currentVisibleFiles = [];
			this.updateFooter();
			this.listEl.createDiv({
				text: "未找到笔记",
				cls: "pd-pick-empty",
			});
			return;
		}

		/* 优先显示有 skill 属性的笔记 */
		if (!query) {
			filtered.sort((a, b) => {
				const aHas = this.hasSkillProperty(a) ? 0 : 1;
				const bHas = this.hasSkillProperty(b) ? 0 : 1;
				if (aHas !== bHas) return aHas - bHas;
				if (this.sortMode === "time-desc") return b.stat.mtime - a.stat.mtime;
				if (this.sortMode === "time-asc") return a.stat.mtime - b.stat.mtime;
				return a.basename.localeCompare(b.basename, "zh-CN");
			});
		}

		/* 保存当前可见文件列表，用于全选和 Shift 连选 */
		this.currentVisibleFiles = filtered.filter(
			(f) => !existingPaths.has(f.path)
		);

		if (this.groupByFolder && !query) {
			this.renderGroupedList(filtered, existingPaths);
		} else {
			this.renderFlatList(filtered, existingPaths);
		}

		this.updateFooter();
	}

	private renderGroupedList(files: TFile[], existingPaths: Set<string>) {
		/* 按文件夹分组 */
		const groups = new Map<string, TFile[]>();
		for (const file of files) {
			const parts = file.path.split("/");
			const folderPath = parts.length > 1 ? parts.slice(0, -1).join("/") : "/";
			if (!groups.has(folderPath)) {
				groups.set(folderPath, []);
			}
			groups.get(folderPath)!.push(file);
		}

		/* 对每个文件夹内的文件排序 */
		for (const [, groupFiles] of groups) {
			groupFiles.sort((a, b) => {
				const aHas = this.hasSkillProperty(a) ? 0 : 1;
				const bHas = this.hasSkillProperty(b) ? 0 : 1;
				if (aHas !== bHas) return aHas - bHas;
				if (this.sortMode === "time-desc") return b.stat.mtime - a.stat.mtime;
				if (this.sortMode === "time-asc") return a.stat.mtime - b.stat.mtime;
				return a.basename.localeCompare(b.basename, "zh-CN");
			});
		}

		/* 按文件夹名排序 */
		const sortedFolders = Array.from(groups.entries()).sort(([a], [b]) => {
			if (a === "/") return -1;
			if (b === "/") return 1;
			return a.localeCompare(b, "zh-CN");
		});

		for (const [folderPath, groupFiles] of sortedFolders) {
			const folderSection = this.listEl.createDiv("pd-pick-folder-section");
			folderSection.style.marginBottom = "8px";

			/* 文件夹标题 */
			const folderHeader = folderSection.createDiv("pd-pick-folder-header");
			folderHeader.style.display = "flex";
			folderHeader.style.alignItems = "center";
			folderHeader.style.gap = "6px";
			folderHeader.style.padding = "6px 10px";
			folderHeader.style.background = "var(--background-secondary)";
			folderHeader.style.borderRadius = "6px";
			folderHeader.style.cursor = "pointer";
			folderHeader.style.userSelect = "none";
			folderHeader.style.transition = "background 0.15s";

			const folderIcon = folderHeader.createEl("span");
			const isExpanded = !this.folderToggleState.has(folderPath);
			folderIcon.innerHTML = isExpanded
				? `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
				: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>`;

			const displayName = folderPath === "/" ? "根目录" : folderPath;
			const folderNameEl = folderHeader.createEl("span", { text: displayName });
			folderNameEl.style.fontSize = "13px";
			folderNameEl.style.fontWeight = "600";
			folderNameEl.style.flex = "1";
			folderNameEl.style.overflow = "hidden";
			folderNameEl.style.textOverflow = "ellipsis";
			folderNameEl.style.whiteSpace = "nowrap";

			const count = folderHeader.createEl("span", { text: `${groupFiles.length}` });
			count.style.fontSize = "11px";
			count.style.color = "var(--text-faint)";
			count.style.background = "var(--background-modifier-border)";
			count.style.padding = "1px 6px";
			count.style.borderRadius = "10px";

			folderHeader.addEventListener("click", () => {
				if (this.folderToggleState.has(folderPath)) {
					this.folderToggleState.delete(folderPath);
				} else {
					this.folderToggleState.add(folderPath);
				}
				this.renderList(this.searchInput.value.toLowerCase().trim());
			});

			/* 折叠时不显示文件列表 */
			if (!isExpanded) continue;

			/* 文件列表 */
			const fileList = folderSection.createDiv("pd-pick-file-list");
			fileList.style.paddingLeft = "16px";
			fileList.style.marginTop = "4px";

			for (const file of groupFiles) {
				this.createFileItem(fileList, file, existingPaths);
			}
		}
	}

	private renderFlatList(files: TFile[], existingPaths: Set<string>) {
		/* 先显示有 skill 属性的笔记 */
		const withSkill = files.filter((f) => this.hasSkillProperty(f));
		const withoutSkill = files.filter((f) => !this.hasSkillProperty(f));

		if (withSkill.length > 0 && !this.searchInput.value) {
			const sectionLabel = this.listEl.createDiv();
			sectionLabel.style.padding = "6px 10px";
			sectionLabel.style.fontSize = "11px";
			sectionLabel.style.color = "var(--interactive-accent)";
			sectionLabel.style.fontWeight = "600";
			sectionLabel.style.background = "rgba(var(--interactive-accent-rgb), 0.08)";
			sectionLabel.style.borderBottom = "1px solid var(--background-modifier-border)";
			sectionLabel.textContent = `📋 已有技能关联的笔记（${withSkill.length}）`;

			for (const file of withSkill) {
				this.createFileItem(this.listEl, file, existingPaths);
			}

			const sectionLabel2 = this.listEl.createDiv();
			sectionLabel2.style.padding = "6px 10px";
			sectionLabel2.style.fontSize = "11px";
			sectionLabel2.style.color = "var(--text-faint)";
			sectionLabel2.style.fontWeight = "600";
			sectionLabel2.style.background = "var(--background-secondary)";
			sectionLabel2.style.borderBottom = "1px solid var(--background-modifier-border)";
			sectionLabel2.textContent = `📝 其他笔记（${withoutSkill.length}）`;
		}

		const filesToRender = this.searchInput.value
			? files
			: withoutSkill.length > 0
			? withoutSkill
			: files;

		for (const file of filesToRender) {
			this.createFileItem(this.listEl, file, existingPaths);
		}
	}

	private createFileItem(parent: HTMLElement, file: TFile, existingPaths: Set<string>) {
		const isExisting = existingPaths.has(file.path);
		const isSelected = this.selectedPaths.has(file.path);
		
		const item = parent.createDiv("pd-pick-item");
		item.style.display = "flex";
		item.style.alignItems = "center";
		item.style.gap = "8px";
		item.style.padding = "6px 10px";
		item.style.cursor = isExisting ? "not-allowed" : "pointer";
		item.style.borderBottom = "1px solid var(--background-modifier-border)";
		item.style.fontSize = "13px";
		item.style.borderRadius = "4px";
		item.style.transition = "background 0.15s";
		item.setAttribute("data-path", file.path);
		
		if (isSelected) {
			item.style.background = "rgba(var(--interactive-accent-rgb), 0.15)";
			item.style.borderLeft = "3px solid var(--interactive-accent)";
		}

		/* Checkbox */
		const checkbox = item.createEl("input", { type: "checkbox" });
		checkbox.style.width = "16px";
		checkbox.style.height = "16px";
		checkbox.style.cursor = isExisting ? "not-allowed" : "pointer";
		checkbox.style.flexShrink = "0";
		checkbox.checked = isSelected;
		checkbox.disabled = isExisting;

		const nameSpan = item.createEl("span", { text: file.basename });
		nameSpan.style.flex = "1";
		nameSpan.style.overflow = "hidden";
		nameSpan.style.textOverflow = "ellipsis";
		nameSpan.style.whiteSpace = "nowrap";

		/* 显示 skill 属性标签 */
		if (this.hasSkillProperty(file)) {
			const skillTag = item.createEl("span", { text: "⚡ 已关联技能" });
			skillTag.style.fontSize = "10px";
			skillTag.style.color = "var(--interactive-accent)";
			skillTag.style.background = "rgba(var(--interactive-accent-rgb), 0.12)";
			skillTag.style.padding = "1px 6px";
			skillTag.style.borderRadius = "4px";
			skillTag.style.flexShrink = "0";
		}

		/* 显示修改时间 */
		const timeSpan = item.createEl("span", { text: this.formatDate(file.stat.mtime) });
		timeSpan.style.fontSize = "10px";
		timeSpan.style.color = "var(--text-faint)";
		timeSpan.style.flexShrink = "0";

		if (isExisting) {
			item.style.opacity = "0.5";
			const tag = item.createEl("span", { text: "✓ 已添加" });
			tag.style.fontSize = "10px";
			tag.style.color = "var(--text-faint)";
			tag.style.flexShrink = "0";
		}

		const handleSelect = (e: Event | MouseEvent) => {
			e.stopPropagation();
			if (isExisting) return;
			
			const isShift = e instanceof MouseEvent && e.shiftKey;
			
			if (isShift && this.lastClickedPath && this.lastClickedPath !== file.path) {
				/* Shift 连选：选择两个点击之间的所有文件 */
				const lastIdx = this.currentVisibleFiles.findIndex(f => f.path === this.lastClickedPath);
				const curIdx = this.currentVisibleFiles.findIndex(f => f.path === file.path);
				
				if (lastIdx !== -1 && curIdx !== -1) {
					const start = Math.min(lastIdx, curIdx);
					const end = Math.max(lastIdx, curIdx);
					for (let i = start; i <= end; i++) {
						const f = this.currentVisibleFiles[i];
						if (!existingPaths.has(f.path)) {
							this.selectedPaths.add(f.path);
						}
					}
				}
			} else {
				/* 普通点击：切换单个 */
				if (this.selectedPaths.has(file.path)) {
					this.selectedPaths.delete(file.path);
				} else {
					this.selectedPaths.add(file.path);
				}
				this.lastClickedPath = file.path;
			}
			
			this.renderList(this.searchInput.value.toLowerCase().trim());
		};

		checkbox.addEventListener("change", handleSelect);
		item.addEventListener("click", handleSelect);

		item.addEventListener("mouseenter", () => {
			if (!isExisting && !isSelected) {
				item.style.background = "var(--background-modifier-hover)";
			}
		});
		item.addEventListener("mouseleave", () => {
			if (!isSelected) {
				item.style.background = "";
				item.style.borderLeft = "";
			}
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}