import {
	App,
	Plugin,
	ItemView,
	WorkspaceLeaf,
	TFile,
	Notice,
	Modal,
	setIcon,
} from "obsidian";

const VIEW_TYPE_PROGRESS = "progress-dashboard-view";

/* ===== 类型定义 ===== */
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
	children?: string[];
}

interface PluginData {
	manualProgress: Record<string, number>;
	customSkills: CustomSkill[];
	attachedNotes: Record<string, string[]>;
	excludedNotes: Record<string, string[]>;
	deletedSkills: string[];
	pinnedCategories: string[];
	skillStartDates: Record<string, string>;
	skillEndDates: Record<string, string>;
}

interface VaultLike {
	getMarkdownFiles(): TFile[];
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
	viewCleanup: Array<() => void> = [];

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_PROGRESS,
			(leaf: WorkspaceLeaf) => new ProgressDashboardView(leaf, this)
		);

		this.addCommand({
			id: "open-view",
			name: "打开看板",
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
		const loadedData = loaded as Record<string, unknown>;
		if (loadedData && loadedData["skillDates"] && typeof loadedData["skillDates"] === "object") {
			const oldDates = loadedData["skillDates"] as Record<string, string>;
			for (const [k, v] of Object.entries(oldDates)) {
				if (v && !this.data.skillStartDates[k]) {
					this.data.skillStartDates[k] = v;
				}
			}
			delete loadedData["skillDates"];
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
			await this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: VIEW_TYPE_PROGRESS,
			active: true,
		});
		await this.app.workspace.revealLeaf(leaf);
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
		const cleanup = this.plugin.viewCleanup;
		if (cleanup && Array.isArray(cleanup)) {
			for (const fn of cleanup) {
				try { fn(); } catch { /* ignore */ }
			}
			this.plugin.viewCleanup = [];
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
		this.renderStat(statsBar, "总技能", String(stats.count), "pd-stat-color-normal");
		this.renderStat(statsBar, "平均进度", stats.avg + "%", this.getColorClassByProgress(stats.avg));
		this.renderStat(statsBar, "已完成", String(stats.completed), "pd-stat-color-done");
		this.renderStat(statsBar, "进行中", String(stats.inProgress), "pd-stat-color-high");
		this.renderStat(statsBar, "刚起步", String(stats.started), "pd-stat-color-low");
		this.renderStat(statsBar, "未开始", String(stats.notStarted), "pd-stat-color-faint");

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

				this.plugin.saveSettings().catch((err: unknown) => { void err; });
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
				this.plugin.saveSettings().catch((err: unknown) => { void err; });
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
			setIcon(catPinBtn, "pin");
			catPinBtn.addEventListener("click", () => {
				if (isCatPinned) {
					this.plugin.data.pinnedCategories = this.plugin.data.pinnedCategories.filter((c) => c !== cat.category);
				} else {
					this.plugin.data.pinnedCategories.push(cat.category);
				}
				this.plugin.saveSettings().catch((err: unknown) => { void err; });
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

	private renderStat(parent: HTMLElement, label: string, value: string, colorClass: string) {
		const item = parent.createDiv("pd-stat-item");
		item.createEl("span", { cls: "pd-stat-label", text: label });
		const val = item.createEl("span", { cls: "pd-stat-value " + colorClass, text: value });
		return val;
	}

	private renderSkillRow(parent: HTMLElement, entry: SkillEntry, depth: number) {
		const row = parent.createDiv("pd-row");
		if (depth > 0) row.addClass("pd-child-row");
		const skillKey = getSkillKey(entry.parentName, entry.name);
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
			setIcon(toggle, isExpanded ? "chevron-down" : "chevron-right");
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
		barFill.addClass(this.getFillClassByProgress(pct));
		const handle = barTrack.createDiv("pd-bar-handle");
		handle.style.left = pct + "%";

		const pctEl = colBar.createDiv("pd-pct-inline");
		pctEl.setText(pct + "%");
		pctEl.addClass(this.getColorClassByProgress(pct));

		const levelBadge = colBar.createEl("span", { cls: "pd-level " + this.getLevelClass(pct), text: this.getLevelText(pct) });

		/* 同步更新 UI（拖动过程中调用，不做异步操作） */
		const updateUI = (clientX: number): number => {
			const rect = barTrack.getBoundingClientRect();
			if (rect.width === 0) return entry.progress;
			let ratio = (clientX - rect.left) / rect.width;
			ratio = Math.max(0, Math.min(1, ratio));
			const newProgress = Math.round(ratio * 100);
			barFill.style.width = newProgress + "%";
			barFill.className = "pd-bar-fill " + this.getFillClassByProgress(newProgress);
			handle.style.left = newProgress + "%";
			pctEl.setText(newProgress + "%");
			pctEl.className = "pd-pct-inline " + this.getColorClassByProgress(newProgress);
			levelBadge.setText(this.getLevelText(newProgress));
			levelBadge.className = "pd-level " + this.getLevelClass(newProgress);
			entry.progress = newProgress;
			entry.manualProgress = newProgress;
			return newProgress;
		};

		/* 异步保存（仅在 mouseup 时调用一次） */
		const saveProgress = async (newProgress: number) => {
			const key = getSkillKey(entry.parentName, entry.name);
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
		};

		/* 拖动状态 */
		let isDragging = false;
		let rafId: number | null = null;
		let lastClientX = 0;

		barTrack.addEventListener("mousedown", (e) => {
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
			if (rafId === null) {
				rafId = window.requestAnimationFrame(() => {
					rafId = null;
					updateUI(lastClientX);
				});
			}
		};

		const onUp = async (e: MouseEvent) => {
			if (!isDragging) return;
			isDragging = false;
			if (rafId !== null) {
				window.cancelAnimationFrame(rafId);
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
			if (id !== null) window.cancelAnimationFrame(id);
		};
		this.plugin.viewCleanup.push(cleanup);

		/* 右栏：笔记列表 + 操作 */
		const colNotes = row.createDiv("pd-col-notes");

		if (entry.files.length > 0) {
			for (const file of entry.files) {
				const noteChip = colNotes.createEl("span", { cls: "pd-note-chip" });

				noteChip.createEl("span", { cls: "pd-note-name", text: file.basename });

				const removeBtn = noteChip.createEl("span", { cls: "pd-note-remove" });
				setIcon(removeBtn, "x");
				removeBtn.title = "从技能中移除此笔记";

				removeBtn.addEventListener("click", async (e) => {
					e.stopPropagation();

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
			setIcon(addChildBtn, "plus");
			addChildBtn.addClass("pd-btn-hidden");

			row.addEventListener("mouseenter", () => {
				addChildBtn.removeClass("pd-btn-hidden");
			});
			row.addEventListener("mouseleave", () => {
				addChildBtn.addClass("pd-btn-hidden");
			});

			addChildBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				const input = actionGroup.createEl("input", { cls: "pd-child-input" });
				input.type = "text";
				input.placeholder = "输入子技能名称";

				actionGroup.replaceChild(input, addChildBtn);
				input.focus();

				const finishInput = (commit: boolean) => {
					const childName = input.value.trim();
					if (commit && childName) {
						const childSkillKey = getSkillKey(entry.name, childName);
						void childSkillKey;

						const exists = entry.children.some((c) => c.name === childName);
						if (exists) {
							new Notice("子技能已存在：" + childName);
						} else {
							let cs = this.plugin.data.customSkills.find((s) => s.name === entry.name);
							if (cs) {
								if (!cs.children || !Array.isArray(cs.children)) {
									cs.children = parseChildren(cs.desc) || [];
								}
								if (!cs.children.includes(childName)) {
									cs.children.push(childName);
								}
							} else {
								this.plugin.data.customSkills.push({
									name: entry.name,
									desc: "",
									category: entry.category,
									children: [childName],
								});
							}

							this.expandedSkills.add(getSkillKey(entry.parentName, entry.name));

							this.plugin.saveSettings().catch((err: unknown) => { void err; });
							new Notice("已添加子技能：" + childName);
							this.renderView();
							return;
						}
					}
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
			setIcon(createBtn, "file-plus");
			createBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				try {
					const fileName = entry.name + ".md";
					const existing = this.app.vault.getAbstractFileByPath(fileName);
					if (existing && existing instanceof TFile) {
						await this.app.workspace.getLeaf(true).openFile(existing);
						return;
					}
					const skillYaml = entry.parentName
						? `${entry.parentName}/${entry.name}`
						: entry.name;
					const frontmatter = `---\nskill: ${skillYaml}\nskill-progress: ${entry.progress}\n---\n\n# ${entry.name}\n\n> 分类：${entry.category}\n> 描述：${entry.desc}\n\n## 学习记录\n\n`;
					const newFile = await this.app.vault.create(fileName, frontmatter);
					await this.app.workspace.getLeaf(true).openFile(newFile);
					this.renderView();
				} catch (err: unknown) {
					new Notice("创建笔记失败: " + String(err));
				}
			});
		}

		/* 添加已有笔记按钮 */
		const attachBtn = actionGroup.createEl("span", { cls: "pd-attach-btn" });
		attachBtn.title = "添加已有笔记";
		setIcon(attachBtn, "paperclip");
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
			iconName: string
		) => {
			const btn = actionGroup.createEl("span", { cls: "pd-date-btn" });
			btn.title = title;
			if (value) {
				btn.createEl("span", { cls: "pd-date-text", text: value.slice(5) });
			}
			setIcon(btn, iconName);

			btn.addEventListener("click", (e) => {
				e.stopPropagation();
				const input = btn.createEl("input", { cls: "pd-date-input-hidden" });
				input.type = "date";
				input.value = value || "";
				const inputEl = input as HTMLInputElement & { showPicker: () => void };
				if (typeof inputEl.showPicker === "function") {
					inputEl.showPicker();
				}
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

		createDateBtn("start", startDate, startDate ? "修改开始日期" : "添加开始日期", "clock");
		createDateBtn("end", endDate, endDate ? "修改结束日期" : "添加结束日期", "circle-check");

		/* 删除按钮 */
		const delBtn = actionGroup.createEl("span", { cls: "pd-del-btn" });
		delBtn.title = "删除此技能";
		setIcon(delBtn, "trash");
		delBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			const skillK = getSkillKey(entry.parentName, entry.name);
			const keysToDelete = [skillK];

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

			const newProgress: Record<string, number> = {};
			for (const [k, v] of Object.entries(this.plugin.data.manualProgress)) {
				if (!keysToDelete.includes(k)) {
					newProgress[k] = v;
				}
			}
			this.plugin.data.manualProgress = newProgress;

			const newAttached: Record<string, string[]> = {};
			for (const [k, v] of Object.entries(this.plugin.data.attachedNotes)) {
				if (!keysToDelete.includes(k)) {
					newAttached[k] = v;
				}
			}
			this.plugin.data.attachedNotes = newAttached;

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

			const isCustomSkill = this.plugin.data.customSkills.some((cs) => cs.name === entry.name);
			if (isCustomSkill && !entry.parentName) {
				this.plugin.data.customSkills = this.plugin.data.customSkills.filter(
					(cs) => cs.name !== entry.name
				);
			}

			this.plugin.saveSettings().catch((err: unknown) => { void err; });
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

	private getColorClassByProgress(p: number): string {
		if (p >= 100) return "pd-color-done";
		if (p >= 67) return "pd-color-high";
		if (p >= 34) return "pd-color-mid";
		if (p > 0) return "pd-color-low";
		return "pd-color-faint";
	}

	private getFillClassByProgress(p: number): string {
		if (p >= 100) return "pd-fill-done";
		if (p >= 67) return "pd-fill-high";
		if (p >= 34) return "pd-fill-mid";
		if (p > 0) return "pd-fill-low";
		return "pd-fill-none";
	}

	private updateParentProgress(parentName: string) {
		const parent = this.entries.find((e) => e.name === parentName && !e.parentName);
		if (!parent || parent.children.length === 0) return;
		const total = parent.children.reduce((sum, c) => sum + c.progress, 0);
		const avg = Math.round(total / parent.children.length);
		parent.progress = avg;
	}

	private refreshParentUI(parentName: string) {
		const parent = this.entries.find((e) => e.name === parentName && !e.parentName);
		if (!parent) return;
		const parentRow = this.contentEl.querySelector(`[data-skill-key="${CSS.escape(parentName)}"][data-is-parent="true"]`);
		if (!parentRow) return;
		const barFill = parentRow.querySelector(".pd-bar-fill") as HTMLElement;
		const handle = parentRow.querySelector(".pd-bar-handle") as HTMLElement;
		const pctEl = parentRow.querySelector(".pd-pct-inline") as HTMLElement;
		const levelBadge = parentRow.querySelector(".pd-level") as HTMLElement;
		const pct = parent.progress;
		if (barFill) {
			barFill.style.width = pct + "%";
			barFill.className = "pd-bar-fill " + this.getFillClassByProgress(pct);
		}
		if (handle) handle.style.left = pct + "%";
		if (pctEl) {
			pctEl.setText(pct + "%");
			pctEl.className = "pd-pct-inline " + this.getColorClassByProgress(pct);
		}
		if (levelBadge) {
			levelBadge.setText(this.getLevelText(pct));
			levelBadge.className = "pd-level " + this.getLevelClass(pct);
		}
	}

	private buildEntries(): SkillEntry[] {
		const noteMap = new Map<string, { progress: number; files: TFile[]; hasExplicitProgress: boolean }>();
		const vaults: VaultLike[] = [this.app.vault];
		const appWithVaults = this.app as unknown as { vaults?: VaultLike[] };
		if (appWithVaults.vaults && Array.isArray(appWithVaults.vaults)) {
			for (const v of appWithVaults.vaults) {
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
			const attFiles: TFile[] = [];
			const excludedPaths = this.plugin.data.excludedNotes[key] || [];
			for (const p of paths) {
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
			const allCollectedFiles: TFile[] = [];
			let anyHasExplicit = false;
			let maxProgress = 0;
			for (const key of keys) {
				const data = noteMap.get(key);
				if (data) {
					for (const f of data.files) {
						if (!allCollectedFiles.some((af) => af.path === f.path)) {
							allCollectedFiles.push(f);
						}
					}
					if (data.hasExplicitProgress) {
						anyHasExplicit = true;
						if (data.progress > maxProgress) maxProgress = data.progress;
					}
				}
			}
			if (allCollectedFiles.length === 0) return null;
			return { progress: anyHasExplicit ? maxProgress : 0, files: allCollectedFiles, hasExplicitProgress: anyHasExplicit };
		};

		const deletedSet = new Set(this.plugin.data.deletedSkills);

		const entries: SkillEntry[] = [];

		for (const cs of this.plugin.data.customSkills) {
			const csKey = getSkillKey(null, cs.name);
			if (deletedSet.has(csKey)) continue;
			const exists = entries.some((e) => e.name === cs.name && !e.parentName);
			if (exists) continue;
			const childrenNames = (cs.children && cs.children.length > 0)
				? cs.children
				: parseChildren(cs.desc);
			if (childrenNames) {
				const childEntries: SkillEntry[] = childrenNames.map((childName): SkillEntry | null => {
					const childKey = getSkillKey(cs.name, childName);
					if (deletedSet.has(childKey)) return null;
					const noteData = collectNoteData([childKey, childName]);
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

		for (const [skillName, data] of noteMap) {
			if (deletedSet.has(skillName)) continue;

			let targetEntry: SkillEntry | null = null;
			let isChild = false;

			targetEntry = entries.find((e) => e.name === skillName && !e.parentName) || null;

			if (!targetEntry) {
				for (const e of entries) {
					if (e.children.length > 0) {
						const child = e.children.find((c) => getSkillKey(e.name, c.name) === skillName);
						if (child) {
							targetEntry = child;
							isChild = true;
							break;
						}
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

			if (targetEntry) {
				targetEntry.files = data.files;
				targetEntry.hasNote = true;
				if (data.hasExplicitProgress) {
					targetEntry.noteProgress = data.progress;
				}
				if (targetEntry.manualProgress === null && data.hasExplicitProgress) {
					targetEntry.progress = data.progress;
				}

				if (!isChild && targetEntry.children.length > 0) {
					const total = targetEntry.children.reduce((sum, c) => sum + c.progress, 0);
					targetEntry.progress = targetEntry.manualProgress !== null ? targetEntry.manualProgress : Math.round(total / targetEntry.children.length);
				}
			}
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

		contentEl.createEl("div", { cls: "pd-modal-msg", text: this.message });

		const btnRow = contentEl.createDiv("pd-modal-btns");

		const cancelBtn = btnRow.createEl("button", { text: "取消", cls: "pd-btn-cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const confirmBtn = btnRow.createEl("button", { text: "确定", cls: "pd-btn-confirm mod-cta" });
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
		catRow.createEl("label", { text: "分类", cls: "pd-form-label" });
		this.categoryInput = catRow.createEl("input", {
			cls: "pd-form-input",
			attr: { type: "text", placeholder: "输入分类名称，如：技术、学习、生活" },
		});

		/* 技能名称 */
		const nameRow = contentEl.createDiv("pd-form-row");
		nameRow.createEl("label", { text: "技能名称", cls: "pd-form-label" });
		this.nameInput = nameRow.createEl("input", {
			cls: "pd-form-input",
			attr: { type: "text", placeholder: "输入技能/项目名称" },
		});

		/* 技能描述 */
		const descRow = contentEl.createDiv("pd-form-row");
		descRow.createEl("label", { text: "技能描述", cls: "pd-form-label" });
		descRow.createEl("div", { text: "简要描述（可选）。用顿号/逗号分隔可拆为子技能", cls: "pd-form-hint" });
		this.descInput = descRow.createEl("input", {
			cls: "pd-form-input",
			attr: { type: "text", placeholder: "简要描述..." },
		});

		/* 按钮 */
		const btnRow = contentEl.createDiv("pd-modal-btns");

		const cancelBtn = btnRow.createEl("button", { text: "取消", cls: "pd-btn-cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const submitBtn = btnRow.createEl("button", {
			text: "添加",
			cls: "pd-btn-confirm mod-cta",
		});
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
	private selectInfoEl!: HTMLElement;
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

		/* 搜索框 */
		this.searchInput = toolbar.createEl("input", {
			cls: "pd-pick-search",
			attr: { type: "text", placeholder: "搜索笔记名称或路径..." },
		});

		/* 排序选项 */
		toolbar.createEl("span", { text: "排序：", cls: "pd-pick-sort-label" });
		const sortSelect = toolbar.createEl("select", { cls: "pd-pick-sort" });
		sortSelect.createEl("option", { value: "time-desc", text: "修改时间↓" });
		sortSelect.createEl("option", { value: "time-asc", text: "修改时间↑" });
		sortSelect.createEl("option", { value: "name", text: "名称排序" });
		sortSelect.value = this.sortMode;
		sortSelect.addEventListener("change", () => {
			this.sortMode = sortSelect.value as PickSortMode;
			this.buildFolderGroups();
			this.renderList(this.searchInput.value.toLowerCase().trim());
		});

		/* 分组开关 */
		toolbar.createEl("span", { text: "按文件夹分组", cls: "pd-pick-group-label" });
		const groupCheckbox = toolbar.createEl("input", { cls: "pd-pick-checkbox", attr: { type: "checkbox" } });
		groupCheckbox.checked = this.groupByFolder;
		groupCheckbox.addEventListener("change", () => {
			this.groupByFolder = groupCheckbox.checked;
			if (this.groupByFolder) this.buildFolderGroups();
			this.renderList(this.searchInput.value.toLowerCase().trim());
		});

		/* 全选按钮 */
		const selectAllBtn = toolbar.createEl("button", { text: "全选", cls: "pd-pick-btn" });
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
		const invertBtn = toolbar.createEl("button", { text: "反选", cls: "pd-pick-btn" });
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

		this.collectFiles();
		if (this.groupByFolder) this.buildFolderGroups();

		/* 底部按钮区域 */
		this.footerEl = contentEl.createDiv("pd-pick-footer");

		this.selectInfoEl = this.footerEl.createEl("span", { cls: "pd-pick-info", text: "已选择 0 个笔记" });

		const btnContainer = this.footerEl.createDiv("pd-pick-btn-container");

		const clearBtn = btnContainer.createEl("button", { text: "清空选择", cls: "pd-pick-clear" });
		clearBtn.addEventListener("click", () => {
			this.selectedPaths.clear();
			this.renderList(this.searchInput.value.toLowerCase().trim());
		});

		this.confirmBtn = btnContainer.createEl("button", { text: "确认添加 (0)", cls: "pd-pick-confirm mod-cta" });
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
			this.plugin.saveSettings().catch((err: unknown) => { void err; });
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
		this.selectInfoEl.setText(`已选择 ${count} 个笔记`);
		this.confirmBtn.setText(`确认添加 (${count})`);
		if (count > 0) {
			this.confirmBtn.addClass("pd-pick-confirm-active");
		} else {
			this.confirmBtn.removeClass("pd-pick-confirm-active");
		}
	}

	private collectFiles() {
		const vaults: VaultLike[] = [this.app.vault];
		const appWithVaults = this.app as unknown as { vaults?: VaultLike[] };
		if (appWithVaults.vaults && Array.isArray(appWithVaults.vaults)) {
			for (const v of appWithVaults.vaults) {
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
		const groups = new Map<string, TFile[]>();
		for (const file of files) {
			const parts = file.path.split("/");
			const folderPath = parts.length > 1 ? parts.slice(0, -1).join("/") : "/";
			if (!groups.has(folderPath)) {
				groups.set(folderPath, []);
			}
			groups.get(folderPath)!.push(file);
		}

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

		const sortedFolders = Array.from(groups.entries()).sort(([a], [b]) => {
			if (a === "/") return -1;
			if (b === "/") return 1;
			return a.localeCompare(b, "zh-CN");
		});

		for (const [folderPath, groupFiles] of sortedFolders) {
			const folderSection = this.listEl.createDiv("pd-pick-folder-section");

			const folderHeader = folderSection.createDiv("pd-pick-folder-header");
			const folderIcon = folderHeader.createEl("span", { cls: "pd-pick-folder-icon" });
			const isExpanded = !this.folderToggleState.has(folderPath);
			setIcon(folderIcon, isExpanded ? "chevron-down" : "chevron-right");

			const displayName = folderPath === "/" ? "根目录" : folderPath;
			folderHeader.createEl("span", { text: displayName, cls: "pd-pick-folder-name" });
			folderHeader.createEl("span", { text: `${groupFiles.length}`, cls: "pd-pick-folder-count" });

			folderHeader.addEventListener("click", () => {
				if (this.folderToggleState.has(folderPath)) {
					this.folderToggleState.delete(folderPath);
				} else {
					this.folderToggleState.add(folderPath);
				}
				this.renderList(this.searchInput.value.toLowerCase().trim());
			});

			if (!isExpanded) continue;

			const fileList = folderSection.createDiv("pd-pick-file-list");
			for (const file of groupFiles) {
				this.createFileItem(fileList, file, existingPaths);
			}
		}
	}

	private renderFlatList(files: TFile[], existingPaths: Set<string>) {
		const withSkill = files.filter((f) => this.hasSkillProperty(f));
		const withoutSkill = files.filter((f) => !this.hasSkillProperty(f));

		if (withSkill.length > 0 && !this.searchInput.value) {
			this.listEl.createEl("div", { cls: "pd-pick-section-skill", text: `📋 已有技能关联的笔记（${withSkill.length}）` });

			for (const file of withSkill) {
				this.createFileItem(this.listEl, file, existingPaths);
			}

			this.listEl.createEl("div", { cls: "pd-pick-section-other", text: `📝 其他笔记（${withoutSkill.length}）` });
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
		if (isExisting) item.addClass("pd-pick-item-existing");
		if (isSelected) item.addClass("pd-pick-item-selected");
		item.setAttribute("data-path", file.path);

		const checkbox = item.createEl("input", { cls: "pd-pick-item-checkbox", attr: { type: "checkbox" } });
		checkbox.checked = isSelected;
		checkbox.disabled = isExisting;

		item.createEl("span", { text: file.basename, cls: "pd-pick-item-name" });

		if (this.hasSkillProperty(file)) {
			item.createEl("span", { text: "⚡ 已关联技能", cls: "pd-pick-item-skill" });
		}

		item.createEl("span", { text: this.formatDate(file.stat.mtime), cls: "pd-pick-item-time" });

		if (isExisting) {
			item.createEl("span", { text: "✓ 已添加", cls: "pd-pick-item-tag" });
		}

		const handleSelect = (e: Event | MouseEvent) => {
			e.stopPropagation();
			if (isExisting) return;

			const isShift = e instanceof MouseEvent && e.shiftKey;

			if (isShift && this.lastClickedPath && this.lastClickedPath !== file.path) {
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
	}

	onClose() {
		this.contentEl.empty();
	}
}
