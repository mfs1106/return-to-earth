import * as THREE from 'three';
import { StarbaseExplorerScene } from '../three/StarbaseExplorerScene.js';

const KIND_ICONS = {
  assembly: '▣',
  structure: '╫',
  shell: '◧',
  internal: '◌',
  mechanism: '⚙',
  engine: '◎',
  interface: '◇',
  fixture: '◈',
  detail: '·',
  part: '◆',
};

const KIND_LABELS = {
  assembly: '装配总成',
  structure: '结构',
  shell: '外壳',
  internal: '内部示意',
  mechanism: '机构',
  engine: '发动机',
  interface: '接口',
  fixture: '设备',
  detail: '细节',
  part: '部件',
};

const FACT_TEXT = {
  official: { label: '公开资料', className: 'official' },
  estimate: { label: '比例估算', className: 'estimate' },
  illustration: { label: '教学示意', className: 'illustration' },
};

const TOURS = {
  overview: {
    label: '整套设施',
    run(explorer) {
      explorer.setPose('stack', { animate: false });
      explorer.setProgress(0, false);
      explorer.setDisplayMode('solid');
      explorer.selectPart(null);
      explorer.scene?.resetView();
    },
  },
  arms: {
    label: '塔臂接触',
    run(explorer) {
      explorer.setPose('catch', { animate: false });
      explorer.setProgress(0, false);
      explorer.setDisplayMode('solid');
      explorer.selectPart('facility/tower/arms/arm-left/contact', { focus: false, fromTour: true });
      explorer.setTimeout(() => {
        explorer.scene?.focusNode('facility/tower/arms/arm-left/contact', { padding: 2.1 });
      }, 60);
    },
  },
  mount: {
    label: '发射支座',
    run(explorer) {
      explorer.setPose('stack', { animate: false });
      explorer.setDisassemblyScope('all');
      explorer.setProgress(33, false);
      explorer.setDisplayMode('solid');
      explorer.selectPart('facility/launch-mount/launch-table', { focus: false, fromTour: true });
      explorer.setTimeout(() => {
        explorer.scene?.focusNode('facility/launch-mount/launch-table', { padding: 2.45 });
      }, 60);
    },
  },
  engines: {
    label: '助推器发动机舱',
    run(explorer) {
      explorer.setPose('stack', { animate: false });
      explorer.setDisassemblyScope('vehicle');
      explorer.setProgress(72, false);
      explorer.setDisplayMode('solid');
      explorer.selectPart('vehicle/stack/booster/engine-bay', { focus: false, fromTour: true });
      explorer.setTimeout(() => {
        explorer.scene?.focusNode('vehicle/stack/booster/engine-bay', { padding: 2.0 });
      }, 60);
    },
  },
  shield: {
    label: '热防护与襟翼',
    run(explorer) {
      explorer.setPose('stack', { animate: false });
      explorer.setDisassemblyScope('vehicle');
      explorer.setProgress(72, false);
      explorer.setDisplayMode('solid');
      explorer.selectPart('vehicle/stack/ship/heat-shield', { focus: false, fromTour: true });
      explorer.setTimeout(() => {
        explorer.scene?.focusNode('vehicle/stack/ship/heat-shield', {
          padding: 2.2,
          direction: new THREE.Vector3(0.28, 0.18, -1),
        });
      }, 60);
    },
  },
};

export class StarbaseExplorer {
  constructor({ quality = 'high', onClose = null, onQualityChange = null } = {}) {
    this.dom = {
      root: document.getElementById('starbaseExplorer'),
      canvas: document.getElementById('starbaseCanvas'),
      stage: document.getElementById('sbStage'),
      loading: document.getElementById('sbLoading'),
      loadError: document.getElementById('sbLoadError'),
      loadErrorText: document.getElementById('sbLoadErrorText'),
      tree: document.getElementById('sbTree'),
      treePanel: document.getElementById('sbTreePanel'),
      partCount: document.getElementById('sbPartCount'),
      search: document.getElementById('sbSearch'),
      searchClear: document.getElementById('sbSearchClear'),
      searchCount: document.getElementById('sbSearchCount'),
      expandAll: document.getElementById('sbExpandAll'),
      detail: document.getElementById('sbDetail'),
      detailCategory: document.getElementById('sbDetailCategory'),
      detailKind: document.getElementById('sbDetailKind'),
      detailName: document.getElementById('sbDetailName'),
      detailId: document.getElementById('sbDetailId'),
      detailFacts: document.getElementById('sbDetailFacts'),
      detailDescription: document.getElementById('sbDetailDescription'),
      detailSource: document.getElementById('sbDetailSource'),
      detailChildren: document.getElementById('sbDetailChildren'),
      detailAssembly: document.getElementById('sbDetailAssembly'),
      detailClose: document.getElementById('sbDetailClose'),
      quality: document.getElementById('sbQuality'),
      partOffset: document.getElementById('sbPartOffset'),
      partOffsetValue: document.getElementById('sbPartOffsetValue'),
      autoFade: document.getElementById('sbAutoFade'),
      progress: document.getElementById('sbProgress'),
      progressValue: document.getElementById('sbProgressValue'),
      sectionScope: document.getElementById('sbSectionScope'),
      scopeNote: document.getElementById('sbScopeNote'),
      hoverTip: document.getElementById('sbHoverTip'),
      manipBanner: document.getElementById('sbManipBanner'),
      manipExit: document.getElementById('sbManipExit'),
      toast: document.getElementById('sbToast'),
      infoModal: document.getElementById('sbInfoModal'),
      infoClose: document.getElementById('sbInfoClose'),
      xray: document.getElementById('sbXrayBtn'),
      hideBtn: document.getElementById('sbHideBtn'),
      ghostBtn: document.getElementById('sbGhostBtn'),
      extractBtn: document.getElementById('sbExtractBtn'),
      manipBtn: document.getElementById('sbManipBtn'),
      treeToggle: document.getElementById('sbTreeToggle'),
      detailToggle: document.getElementById('sbDetailToggle'),
    };
    this.onClose = onClose;
    this.onQualityChange = onQualityChange;
    this.quality = quality;
    this.scene = null;
    this.active = true;
    this.raf = 0;
    this.lastTime = 0;
    this.lastHoverCheck = 0;
    this.timers = new Set();
    this.abort = new AbortController();
    this.resizeObserver = null;
    this.selectedId = null;
    this.hoveredId = null;
    this.search = '';
    this.pose = 'stack';
    this.poseTarget = 0;
    this.poseBlend = 0;
    this.progress = 0;
    this.progressTarget = 0;
    this.displayMode = 'solid';
    this.disassemblyScope = 'all';
    this.sectionScope = 'all';
    this.hiddenIds = new Set();
    this.ghostIds = new Set();
    this.mutedAssemblies = new Set();
    this.autoFade = false;
    this.expanded = new Set(['starbase', 'facility', 'vehicle', 'facility/tower', 'facility/launch-mount', 'vehicle/stack']);
    this.manipulating = false;
    this.manipDrag = null;
    this.pointerStart = null;
    this.pointerMoved = 0;
    this.toastTimer = null;
    this.detailOpen = false;
    this.media = window.matchMedia('(max-width: 900px)');
    this.mobile = this.media.matches;

    this._setInitialUI();
    this._bindEvents();
    this._showLoading(true);
    this.setTimeout(() => this._initScene(), 60);
    document.body.classList.add('sb-open');
  }

  _setInitialUI() {
    const d = this.dom;
    d.quality.value = this.quality;
    d.progress.value = '0';
    d.progressValue.textContent = '整装 · 0%';
    d.sectionScope.value = 'all';
    d.autoFade.checked = false;
    d.detail.hidden = true;
    d.loadError.hidden = true;
    d.infoModal.hidden = true;
    d.manipBanner.hidden = true;
    d.searchClear.hidden = true;
    this._setModeUI();
    this._setPoseUI();
    this._setScopeUI();
  }

  _bindEvents() {
    const d = this.dom;
    const options = { signal: this.abort.signal };
    document.getElementById('starbaseClose')?.addEventListener('click', () => this.onClose?.(), options);
    document.getElementById('sbRetryBtn')?.addEventListener('click', () => {
      if (!this.active) return;
      this._showLoading(true);
      this.dom.loadError.hidden = true;
      this.setTimeout(() => this._initScene(), 80);
    }, options);
    d.treeToggle?.addEventListener('click', () => {
      d.root.classList.toggle('sb-tree-open');
      d.treeToggle.setAttribute('aria-expanded', String(d.root.classList.contains('sb-tree-open')));
    }, options);
    d.treeToggle?.setAttribute('aria-expanded', String(!this.mobile));
    d.detailToggle?.addEventListener('click', () => {
      if (!this.selectedId) {
        this._toast('先选择一个部件，再打开说明面板。');
        return;
      }
      d.root.classList.toggle('sb-detail-open');
      d.detailToggle.setAttribute('aria-expanded', String(d.root.classList.contains('sb-detail-open')));
    }, options);
    d.detailToggle?.setAttribute('aria-expanded', 'false');
    d.quality?.addEventListener('change', () => {
      this.quality = d.quality.value;
      this.scene?.setQuality(this.quality);
      this.onQualityChange?.(this.quality);
    }, options);
    d.progress?.addEventListener('input', () => {
      this.setProgress(Number(d.progress.value), false);
    }, options);
    d.sectionScope?.addEventListener('change', () => {
      this.sectionScope = d.sectionScope.value;
      this._applyState();
    }, options);
    d.autoFade?.addEventListener('change', () => {
      this.autoFade = d.autoFade.checked;
      this._applyState();
    }, options);
    d.search?.addEventListener('input', () => {
      this.search = d.search.value.trim();
      d.searchClear.hidden = !this.search;
      this._renderTree();
    }, options);
    d.search?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !this.search || !this.scene) return;
      event.preventDefault();
      const query = this.search.toLowerCase();
      const first = this.scene.model.order.find(
        (node) =>
          node.id !== 'starbase' &&
          `${node.name} ${node.id} ${node.category}`.toLowerCase().includes(query),
      );
      if (first) this.selectPart(first.id);
    }, options);
    d.searchClear?.addEventListener('click', () => {
      d.search.value = '';
      this.search = '';
      d.searchClear.hidden = true;
      this._renderTree();
      d.search.focus();
    }, options);
    d.expandAll?.addEventListener('click', () => {
      const allExpanded = this._allNodesExpanded();
      this.expanded = allExpanded ? new Set(['starbase', 'facility', 'vehicle']) : new Set(this.scene?.model.nodes.keys() ?? []);
      this._renderTree();
      d.expandAll.textContent = allExpanded ? '展开全部' : '收起层级';
    }, options);
    d.tree?.addEventListener('click', (event) => {
      const row = event.target.closest('[data-sb-node]');
      if (!row) return;
      const id = row.dataset.sbNode;
      if (event.target.closest('.sb-tree-toggle')) {
        if (this.expanded.has(id)) this.expanded.delete(id);
        else this.expanded.add(id);
        this._renderTree();
        return;
      }
      this.selectPart(id);
      if (this.mobile) {
        d.root.classList.remove('sb-tree-open');
        d.treeToggle?.setAttribute('aria-expanded', 'false');
      }
    }, options);
    d.tree?.addEventListener('keydown', (event) => {
      const row = event.target.closest('[data-sb-node]');
      if (!row) return;
      const rows = [...d.tree.querySelectorAll('[data-sb-node]')];
      const index = rows.indexOf(row);
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.selectPart(row.dataset.sbNode);
      } else if (event.key === 'ArrowDown' && index < rows.length - 1) {
        event.preventDefault();
        rows[index + 1].focus();
      } else if (event.key === 'ArrowUp' && index > 0) {
        event.preventDefault();
        rows[index - 1].focus();
      } else if (event.key === 'ArrowRight' && this.scene?.model.getNode(row.dataset.sbNode)?.children.length) {
        event.preventDefault();
        this.expanded.add(row.dataset.sbNode);
        this._renderTree();
        d.tree.querySelector(`[data-sb-node="${CSS.escape(row.dataset.sbNode)}"]`)?.focus();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const id = row.dataset.sbNode;
        if (this.expanded.has(id)) {
          this.expanded.delete(id);
          this._renderTree();
          d.tree.querySelector(`[data-sb-node="${CSS.escape(id)}"]`)?.focus();
        } else {
          const parent = this.scene?.model.getNode(id)?.parent;
          if (parent) d.tree.querySelector(`[data-sb-node="${CSS.escape(parent)}"]`)?.focus();
        }
      }
    }, options);
    d.detailClose?.addEventListener('click', () => {
      this.selectPart(null);
      if (this.mobile) d.root.classList.remove('sb-detail-open');
    }, options);
    document.querySelectorAll('[data-sb-pose]').forEach((button) => {
      button.addEventListener('click', () => this.setPose(button.dataset.sbPose), options);
    });
    document.querySelectorAll('[data-sb-compare]').forEach((button) => {
      button.addEventListener('click', () => this.setCompare(button.dataset.sbCompare), options);
    });
    document.querySelectorAll('[data-sb-progress]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = Number(button.dataset.sbProgress);
        this.setProgress(value, true);
        if (value <= 0) {
          this.scene?.resetView();
        } else {
          this.setTimeout(() => this.scene?.fitCore({ padding: 1.12 }), 520);
        }
      }, options);
    });
    document.querySelectorAll('[data-sb-scope]').forEach((button) => {
      button.addEventListener('click', () => this.setDisassemblyScope(button.dataset.sbScope), options);
    });
    document.querySelectorAll('[data-sb-tour]').forEach((button) => {
      button.addEventListener('click', () => this.runTour(button.dataset.sbTour), options);
    });
    document.getElementById('sbFit')?.addEventListener('click', () => this.scene?.fitAll(), options);
    document.getElementById('sbHomeView')?.addEventListener('click', () => this.scene?.resetView(), options);
    document.getElementById('sbResetAll')?.addEventListener('click', () => this.resetAll(), options);
    document.getElementById('sbResetAssembly')?.addEventListener('click', () => this.resetAssembly(), options);
    d.xray?.addEventListener('click', () => {
      this.setDisplayMode(this.displayMode === 'xray' ? 'solid' : 'xray');
    }, options);
    d.extractBtn?.addEventListener('click', () => this.toggleExtract(), options);
    d.hideBtn?.addEventListener('click', () => this.toggleHide(), options);
    d.ghostBtn?.addEventListener('click', () => this.toggleGhost(), options);
    document.getElementById('sbFocusBtn')?.addEventListener('click', () => {
      if (this.selectedId) this.scene?.focusNode(this.selectedId, { padding: 1.75 });
    }, options);
    document.getElementById('sbResetPartBtn')?.addEventListener('click', () => this.resetSelectedTransform(), options);
    document.getElementById('sbRotateYBtn')?.addEventListener('click', () => this.rotateSelected('y'), options);
    document.getElementById('sbRotateXBtn')?.addEventListener('click', () => this.rotateSelected('x'), options);
    d.manipBtn?.addEventListener('click', () => this.toggleManipulation(), options);
    d.manipExit?.addEventListener('click', () => this.stopManipulation(), options);
    d.partOffset?.addEventListener('input', () => {
      this._applyPartOffset(Number(d.partOffset.value));
    }, options);
    document.getElementById('sbInfoBtn')?.addEventListener('click', () => this._showInfo(true), options);
    d.infoClose?.addEventListener('click', () => this._showInfo(false), options);
    d.infoModal?.addEventListener('click', (event) => {
      if (event.target === d.infoModal) this._showInfo(false);
    }, options);
    d.canvas?.addEventListener('pointerdown', (event) => this._onPointerDown(event), options);
    d.canvas?.addEventListener('pointermove', (event) => this._onPointerMove(event), options);
    d.canvas?.addEventListener('pointerup', (event) => this._onPointerUp(event), options);
    d.canvas?.addEventListener('pointerleave', () => {
      this._setHover(null);
      this.dom.hoverTip.hidden = true;
    }, options);
    d.canvas?.addEventListener('dblclick', () => this.scene?.resetView(), options);
    window.addEventListener('keydown', (event) => this._onKeyDown(event), options);
    this.media.addEventListener('change', (event) => {
      this.mobile = event.matches;
      if (!this.mobile) {
        this.dom.root.classList.remove('sb-tree-open', 'sb-detail-open');
      }
    }, options);
    this.resizeObserver = new ResizeObserver(() => this._resize());
    this.resizeObserver.observe(this.dom.stage);
  }

  _onKeyDown(event) {
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      if (event.key === 'Escape') target.blur();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'escape') {
      if (!this.dom.infoModal.hidden) {
        this._showInfo(false);
      } else if (this.manipulating) {
        this.stopManipulation();
      } else if (this.mobile && (this.dom.root.classList.contains('sb-tree-open') || this.dom.root.classList.contains('sb-detail-open'))) {
        this.dom.root.classList.remove('sb-tree-open', 'sb-detail-open');
      } else {
        this.onClose?.();
      }
      return;
    }
    if (key === '0') this.scene?.resetView();
    else if (key === 'f') this.scene?.fitAll();
    else if (key === 'a') this.setCompare('assembled');
    else if (key === 'e') this.setCompare('exploded');
    else if (key === 'x') this.setDisplayMode(this.displayMode === 'xray' ? 'solid' : 'xray');
    else if (key === 's') this.setDisplayMode(this.displayMode === 'section' ? 'solid' : 'section');
    else if (/^[1-5]$/.test(key)) {
      const names = ['overview', 'arms', 'mount', 'engines', 'shield'];
      this.runTour(names[Number(key) - 1]);
    }
  }

  _initScene() {
    if (!this.active) return;
    if (this.scene) return;
    try {
      this.scene = new StarbaseExplorerScene(this.dom.canvas, { quality: this.quality });
      this.dom.partCount.textContent = `${this.scene.model.order.length - 1} 个部件`;
      this._renderTree();
      this._applyState();
      this._showLoading(false);
      this.dom.loadError.hidden = true;
      this.lastTime = performance.now();
      this.raf = requestAnimationFrame((time) => this._tick(time));
      this._toast('点击部件或使用左侧结构树开始探索。');
      this._resize();
    } catch (error) {
      console.error(error);
      try {
        this.scene?.dispose();
      } catch (disposeError) {
        console.warn('Starbase failed scene cleanup', disposeError);
      }
      this.scene = null;
      cancelAnimationFrame(this.raf);
      this._showLoading(false);
      this.dom.loadError.hidden = false;
      this.dom.loadErrorText.textContent = `结构场景加载失败：${error?.message ?? '未知错误'}。原有飞行演示不受影响，可点击重试或返回。`;
    }
  }

  _tick(time) {
    if (!this.active || !this.scene) return;
    const dt = Math.min(0.2, (time - this.lastTime) / 1000 || 0.016);
    this.lastTime = time;
    const poseDelta = this.poseTarget - this.poseBlend;
    if (Math.abs(poseDelta) > 0.001) this.poseBlend += poseDelta * Math.min(1, dt * 5.5);
    else this.poseBlend = this.poseTarget;
    const progressDelta = this.progressTarget - this.progress;
    if (Math.abs(progressDelta) > 0.01) this.progress += progressDelta * Math.min(1, dt * 12);
    else this.progress = this.progressTarget;
    this._applyState();
    this._syncUiProgress();
    this.scene.setSelection(this.selectedId);
    this.scene.setHover(this.hoveredId);
    this.scene.update(dt);
    this.raf = requestAnimationFrame((next) => this._tick(next));
  }

  _applyState() {
    if (!this.scene) return;
    if (this.displayMode === 'section') {
      // Keep the cutaway facing the viewer: remove the half between the
      // camera and the *scope assembly*, leaving its interior visible.
      const dir = this.scene.camera.position.clone().sub(this.scene.controls.target);
      dir.y = 0;
      if (dir.lengthSq() < 0.001) dir.set(0, 0, 1);
      dir.normalize();
      const scopeIds = {
        booster: 'vehicle/stack/booster',
        ship: 'vehicle/stack/ship',
        tower: 'facility/tower',
        platform: 'facility/launch-mount',
        connection: 'vehicle/stack/connection',
      };
      const scope = this.scene.model.getNode(scopeIds[this.sectionScope] || '');
      let center = this.scene.controls.target;
      if (scope) {
        const box = new THREE.Box3().setFromObject(scope.object);
        if (!box.isEmpty()) center = box.getCenter(new THREE.Vector3());
      }
      this.scene.model.clipPlane.normal.copy(dir).negate();
      this.scene.model.clipPlane.constant = center.dot(dir);
    }
    this.scene.model.applyState({
      progress: this.progress / 100,
      poseBlend: this.poseBlend,
      displayMode: this.displayMode,
      disassemblyScope: this.disassemblyScope,
      sectionScope: this.sectionScope,
      selectedId: this.selectedId,
      hiddenIds: this.hiddenIds,
      ghostIds: this.ghostIds,
      autoFade: this.autoFade,
      mutedAssemblies: this.mutedAssemblies,
    });
  }

  _resize() {
    if (!this.scene || !this.dom.stage) return;
    const rect = this.dom.stage.getBoundingClientRect();
    this.scene.resize(rect.width, rect.height);
  }

  _showLoading(show) {
    if (!this.dom.loading) return;
    this.dom.loading.hidden = !show;
    this.dom.root.setAttribute('aria-busy', String(show));
  }

  /* ------------------------------------------------------------------ tree */
  _nodeMatches(node, query) {
    if (!query) return true;
    const haystack = `${node.name} ${node.id} ${node.category}`.toLowerCase();
    return haystack.includes(query);
  }

  _collectMatches() {
    const query = this.search.toLowerCase();
    const matches = new Set();
    if (!query || !this.scene) return matches;
    const walk = (id) => {
      const node = this.scene.model.getNode(id);
      if (!node) return false;
      let result = this._nodeMatches(node, query);
      node.children.forEach((childId) => {
        if (walk(childId)) result = true;
      });
      if (result) matches.add(id);
      return result;
    };
    walk('starbase');
    return matches;
  }

  _renderTree() {
    if (!this.scene || !this.dom.tree) return;
    const model = this.scene.model;
    const query = this.search.toLowerCase();
    const matches = this._collectMatches();
    const searchHits = query
      ? [...matches].filter((id) => id !== 'starbase' && this._nodeMatches(model.getNode(id), query)).length
      : 0;
    this.dom.searchCount.textContent = query
      ? `${searchHits} 个匹配 · ${matches.size} 个层级节点`
      : '全部可探索部件';
    const visibleNodes = [];
    const buildRow = (id, depth, parentContainer) => {
      const node = model.getNode(id);
      if (!node) return;
      if (query && !matches.has(id)) return;
      const hasChildren = node.children.length > 0;
      const isExpanded = query ? true : this.expanded.has(id);
      const row = document.createElement('div');
      row.className = 'sb-tree-row';
      row.dataset.sbNode = id;
      row.style.setProperty('--depth', String(depth));
      row.setAttribute('role', 'treeitem');
      row.setAttribute('aria-level', String(depth + 1));
      row.setAttribute('aria-selected', String(this.selectedId === id));
      row.tabIndex = 0;
      if (this.selectedId === id) row.classList.add('is-selected');
      if (this.hiddenIds.has(id)) row.classList.add('is-hidden');
      if (this.ghostIds.has(id)) row.classList.add('is-ghosted');
      if (matches.has(id) && query && this._nodeMatches(node, query)) row.classList.add('is-search-hit');
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = `sb-tree-toggle ${hasChildren ? '' : 'is-leaf'}`;
      toggle.setAttribute('aria-label', hasChildren ? `${isExpanded ? '收起' : '展开'} ${node.name}` : '叶节点');
      toggle.setAttribute('aria-expanded', hasChildren ? String(isExpanded) : undefined);
      toggle.innerHTML = hasChildren ? `<span>${isExpanded ? '▾' : '▸'}</span>` : '<span>·</span>';
      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'sb-tree-select';
      select.innerHTML = `<span class="sb-tree-icon">${KIND_ICONS[node.kind] ?? '◆'}</span><span class="sb-tree-label">${escapeHtml(node.name)}</span>`;
      if (this.hiddenIds.has(id)) select.innerHTML += '<span class="sb-tree-tag">隐藏</span>';
      else if (this.ghostIds.has(id)) select.innerHTML += '<span class="sb-tree-tag">半透明</span>';
      row.append(toggle, select);
      parentContainer.appendChild(row);
      visibleNodes.push(row);
      if (hasChildren && isExpanded) {
        const group = document.createElement('div');
        group.className = 'sb-tree-children';
        group.setAttribute('role', 'group');
        row.setAttribute('aria-expanded', 'true');
        node.children.forEach((childId) => buildRow(childId, depth + 1, group));
        parentContainer.appendChild(group);
      } else if (hasChildren) {
        row.setAttribute('aria-expanded', 'false');
      }
    };
    const fragment = document.createDocumentFragment();
    buildRow('starbase', 0, fragment);
    this.dom.tree.innerHTML = '';
    this.dom.tree.appendChild(fragment);
    this.dom.tree.dataset.visibleRows = String(visibleNodes.length);
    this._syncTreeSelection();
  }

  _syncTreeSelection() {
    this.dom.tree.querySelectorAll('[data-sb-node]').forEach((row) => {
      const isSelected = row.dataset.sbNode === this.selectedId;
      row.classList.toggle('is-selected', isSelected);
      row.setAttribute('aria-selected', String(isSelected));
    });
  }

  _allNodesExpanded() {
    if (!this.scene) return false;
    return [...this.scene.model.nodes.keys()].every((id) => this.expanded.has(id));
  }

  _expandAncestors(id) {
    if (!this.scene) return;
    this.scene.model.ancestorsOf(id).forEach((ancestor) => this.expanded.add(ancestor));
    if (this.scene.model.getNode(id)?.children.length) this.expanded.add(id);
  }

  /* -------------------------------------------------------------- selection */
  selectPart(id, { focus = true, fromTour = false } = {}) {
    if (!id) {
      this.selectedId = null;
      this.detailOpen = false;
      this.dom.detail.hidden = true;
      this.dom.root.classList.remove('sb-detail-open');
      this.scene?.setSelection(null);
      this._syncTreeSelection();
      return;
    }
    const node = this.scene?.model.getNode(id);
    if (!node) return;
    if (this.manipulating) this.stopManipulation();
    const needsInterior =
      node.internal ||
      node.kind === 'engine' ||
      node.id.includes('/engine-bay') ||
      node.id.includes('/tanks');
    if (needsInterior && this.displayMode === 'solid') {
      this.displayMode = 'xray';
      this._setModeUI();
    }
    if (this.displayMode === 'section') {
      const scoped = this._sectionScopeFor(id);
      if (scoped && this.sectionScope !== scoped) {
        this.sectionScope = scoped;
        this.dom.sectionScope.value = scoped;
      }
    }
    this.selectedId = id;
    this.detailOpen = true;
    this._expandAncestors(id);
    this._renderTree();
    this._updateDetail();
    this.dom.detail.hidden = false;
    if (this.mobile) {
      this.dom.root.classList.add('sb-detail-open');
      this.dom.detailToggle?.setAttribute('aria-expanded', 'true');
    }
    if (focus && !fromTour) this.scene?.focusNode(id, { padding: 1.8 });
    this._toast(`${node.name}${node.facts?.includes('illustration') ? ' · 含教学示意内容' : ''}`, 2200);
  }

  _updateDetail() {
    if (!this.selectedId || !this.scene) return;
    const model = this.scene.model;
    const node = model.getNode(this.selectedId);
    if (!node) return;
    const d = this.dom;
    d.detailCategory.textContent = node.category;
    d.detailKind.textContent = KIND_LABELS[node.kind] ?? '部件';
    d.detailName.textContent = node.name;
    d.detailId.textContent = node.id;
    d.detailDescription.textContent = node.description;
    const sourceLead = node.source
      ? `公开依据线索：${node.source}。尺寸、内部机构与未公开细节均为教学示意或比例估算。`
      : node.facts?.includes('official')
        ? '公开资料支持该部件的用途与位置；本模型中的精确尺寸、内部机构与未公开细节为教学示意或比例估算。'
        : '公开资料未提供该部件内部构造；本模型中的几何、尺寸与连接细节为教学示意或比例估算。';
    const links = node.facts?.includes('official')
      ? ' <a href="https://www.spacex.com/vehicles/starship/design" target="_blank" rel="noopener">Starship design ↗</a> <a href="https://www.spacex.com/vehicles/starship/assets/media/Starbase%20Overview.pdf" target="_blank" rel="noopener">Starbase Overview ↗</a>'
      : '';
    d.detailSource.innerHTML = `${escapeHtml(sourceLead)}${links}`;
    d.detailChildren.textContent = String(node.children.length);
    const parent = node.parent ? model.getNode(node.parent) : null;
    d.detailAssembly.textContent = parent?.name ?? 'Starbase';
    d.detailFacts.innerHTML = '';
    (node.facts ?? []).forEach((fact) => {
      const info = FACT_TEXT[fact];
      if (!info) return;
      const tag = document.createElement('span');
      tag.className = `sb-fact ${info.className}`;
      tag.textContent = info.label;
      d.detailFacts.appendChild(tag);
    });
    if (node.internal) {
      const tag = document.createElement('span');
      tag.className = 'sb-fact illustration';
      tag.textContent = '仅在剖面 / X-Ray 中显示';
      d.detailFacts.appendChild(tag);
    }
    const isHidden = this.fileHidden(node.id);
    const isGhosted = this.fileGhosted(node.id);
    d.hideBtn.textContent = isHidden ? '显示' : '隐藏';
    d.hideBtn.classList.toggle('is-active', isHidden);
    d.ghostBtn.textContent = isGhosted ? '取消半透明' : '半透明';
    d.ghostBtn.classList.toggle('is-active', isGhosted);
    const offsetLength = node.manualOffset.length();
    d.extractBtn.textContent = offsetLength > 0.1 ? '收起' : '拆出';
    d.extractBtn.classList.toggle('is-active', offsetLength > 0.1);
    d.partOffset.value = String(Math.round(offsetLength));
    d.partOffsetValue.textContent = String(Math.round(offsetLength));
    d.manipBtn.classList.toggle('is-active', this.manipulating);
    const hasRotation = Math.abs(node.manualRotation.x) > 0.01 || Math.abs(node.manualRotation.y) > 0.01 || Math.abs(node.manualRotation.z) > 0.01;
    document.getElementById('sbResetPartBtn').classList.toggle('is-active', offsetLength > 0.1 || hasRotation);
  }

  fileHidden(id) {
    if (!id) return false;
    if (this.hiddenIds.has(id)) return true;
    return [...this.hiddenIds].some((hidden) => id.startsWith(`${hidden}/`));
  }

  fileGhosted(id) {
    if (!id) return false;
    if (this.ghostIds.has(id)) return true;
    return [...this.ghostIds].some((ghost) => id.startsWith(`${ghost}/`));
  }

  /* ------------------------------------------------------------------ modes */
  setPose(pose, { animate = true } = {}) {
    this.pose = pose === 'catch' ? 'catch' : 'stack';
    this.poseTarget = this.pose === 'catch' ? 1 : 0;
    if (!animate) this.poseBlend = this.poseTarget;
    this._setPoseUI();
    if (this.selectedId && this.pose === 'catch' && this.selectedId.startsWith('vehicle/stack/ship')) {
      this._toast('捕获位状态隐藏 Starship，以便观察 Super Heavy 与机械臂。切回整箭姿态可继续探索飞船。');
    }
    this._applyState();
  }

  _setPoseUI() {
    document.querySelectorAll('[data-sb-pose]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.sbPose === this.pose);
    });
  }

  setDisplayMode(mode) {
    this.displayMode = mode;
    if (mode === 'section') {
      // Cut the assembly the user is looking at; otherwise default to the
      // rocket pressure vessels instead of slicing the complete facility.
      const scoped = this._sectionScopeFor(this.selectedId);
      if (scoped) {
        this.sectionScope = scoped;
      } else if (this.sectionScope === 'all') {
        this.sectionScope = 'booster';
      }
      this.dom.sectionScope.value = this.sectionScope;
    }
    this._setModeUI();
    this._applyState();
  }

  _sectionScopeFor(id) {
    if (!id) return null;
    if (id.startsWith('facility/tower')) return 'tower';
    if (id.startsWith('facility/launch-mount')) return 'platform';
    if (id.startsWith('vehicle/stack/ship')) return 'ship';
    if (id.startsWith('vehicle/stack/booster') || id.startsWith('vehicle/stack/connection')) return 'booster';
    return null;
  }

  setCompare(mode) {
    if (mode === 'assembled') {
      this.setProgress(0, true);
      this.setDisplayMode('solid');
    } else if (mode === 'exploded') {
      this.setProgress(66, true);
      this.setDisplayMode('solid');
      this.setTimeout(() => this.scene?.fitCore({ padding: 1.12 }), 560);
    } else if (mode === 'section') {
      if (this.progress < 30) this.setProgress(36, true);
      this.setDisplayMode('section');
      this.setTimeout(() => this.scene?.fitCore({ padding: 1.18 }), 420);
    }
  }

  _setModeUI() {
    document.querySelectorAll('[data-sb-compare]').forEach((button) => {
      const mode = button.dataset.sbCompare;
      const active =
        (mode === 'section' && this.displayMode === 'section') ||
        (mode === 'assembled' && this.displayMode === 'solid' && this.progress <= 1 && this.progressTarget <= 1) ||
        (mode === 'exploded' && this.displayMode === 'solid' && (this.progress > 1 || this.progressTarget > 1));
      button.classList.toggle('is-active', active);
    });
    this.dom.xray.classList.toggle('is-active', this.displayMode === 'xray');
    this.dom.sectionScope.disabled = this.displayMode === 'solid';
  }

  setProgress(value, animate = false) {
    const clamped = Math.max(0, Math.min(100, value));
    this.progressTarget = clamped;
    if (!animate) this.progress = clamped;
    this.dom.progress.value = String(clamped);
    this._syncUiProgress();
    this._setModeUI();
    this._applyState();
  }

  _syncUiProgress() {
    const value = Math.round(this.progress);
    this.dom.progressValue.textContent = `${value <= 0 ? '整装' : value >= 99 ? '细部拆解' : '拆解中'} · ${value}%`;
    const current = Number(this.dom.progress.value);
    if (Math.abs(current - this.progress) > 0.7) this.dom.progress.value = String(this.progress);
    document.querySelectorAll('[data-sb-progress]').forEach((button) => {
      const target = Number(button.dataset.sbProgress);
      button.classList.toggle('is-active', Math.abs(value - target) < 1);
    });
    this._setModeUI();
  }

  setDisassemblyScope(scope) {
    this.disassemblyScope = scope;
    this.mutedAssemblies.clear();
    this._setScopeUI();
    this._applyState();
  }

  _setScopeUI() {
    document.querySelectorAll('[data-sb-scope]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.sbScope === this.disassemblyScope);
    });
    const labels = {
      all: '全部总成参与当前拆解',
      'facility/tower': '仅发射塔与机械臂参与当前拆解',
      'facility/launch-mount': '仅发射平台参与当前拆解',
      vehicle: '仅 Starship / Super Heavy 参与当前拆解',
    };
    this.dom.scopeNote.textContent = labels[this.disassemblyScope] ?? '自定义范围';
  }

  resetAll() {
    this.progress = 0;
    this.progressTarget = 0;
    this.progress = 0;
    this.displayMode = 'solid';
    this.disassemblyScope = 'all';
    this.sectionScope = 'all';
    this.pose = 'stack';
    this.poseTarget = 0;
    this.poseBlend = 0;
    if (this.manipulating) this.stopManipulation();
    this.hiddenIds.clear();
    this.ghostIds.clear();
    this.mutedAssemblies.clear();
    this.autoFade = false;
    this.dom.autoFade.checked = false;
    this.dom.progress.value = '0';
    this.dom.sectionScope.value = 'all';
    this.scene?.model.clearAllManual();
    this._setPoseUI();
    this._setScopeUI();
    this._setModeUI();
    this._syncUiProgress();
    this._applyState();
    this._updateDetail();
    this._renderTree();
    this.scene?.resetView();
    this._toast('整套设施已恢复到默认整装视图。');
  }

  resetAssembly() {
    if (!this.selectedId) {
      this._toast('请先在结构树或三维模型中选择一个部件。');
      return;
    }
    const assembly = this._assemblyRoot(this.selectedId);
    if (!assembly) return;
    if (this.mutedAssemblies.has(assembly)) {
      this.mutedAssemblies.delete(assembly);
      this._toast('已恢复该总成的拆解状态。');
    } else {
      this.mutedAssemblies.add(assembly);
      this._toast('已只复原当前总成，其余拆解保持不变。');
    }
    this._applyState();
    this._updateDetail();
  }

  _assemblyRoot(id) {
    if (!id) return null;
    if (id.startsWith('facility/tower/arms')) return 'facility/tower/arms';
    if (id.startsWith('facility/tower')) return 'facility/tower';
    if (id.startsWith('facility/launch-mount')) return 'facility/launch-mount';
    if (id.startsWith('facility/tank-farm')) return 'facility/tank-farm';
    if (id.startsWith('vehicle/stack/booster')) return 'vehicle/stack/booster';
    if (id.startsWith('vehicle/stack/ship')) return 'vehicle/stack/ship';
    if (id.startsWith('vehicle/stack/connection')) return 'vehicle/stack/connection';
    return 'vehicle';
  }

  /* --------------------------------------------------------- local transforms */
  _extractDirection(node) {
    const x = node.basePosition.x;
    const z = node.basePosition.z;
    const horizontal = new THREE.Vector3(x, 0.28, z);
    if (horizontal.lengthSq() < 2.5) horizontal.set(0.35, 0.25, 1);
    return horizontal.normalize();
  }

  _applyPartOffset(value) {
    if (!this.selectedId || !this.scene) return;
    const node = this.scene.model.getNode(this.selectedId);
    if (!node) return;
    const offset = this._extractDirection(node).multiplyScalar(value);
    this.scene.model.setManualOffset(this.selectedId, offset);
    this.dom.partOffsetValue.textContent = String(Math.round(value));
    this.dom.extractBtn.textContent = value > 0.1 ? '收起' : '拆出';
    this.dom.extractBtn.classList.toggle('is-active', value > 0.1);
    this._applyState();
  }

  toggleExtract() {
    if (!this.selectedId) return;
    const node = this.scene.model.getNode(this.selectedId);
    if (!node) return;
    if (node.manualOffset.lengthSq() > 0.1) {
      this.scene.model.clearManual(this.selectedId);
      this.dom.partOffset.value = '0';
      this.dom.partOffsetValue.textContent = '0';
    } else {
      this.dom.partOffset.value = '30';
      this._applyPartOffset(30);
    }
    this._updateDetail();
  }

  toggleHide() {
    if (!this.selectedId) return;
    if (this.hiddenIds.has(this.selectedId)) {
      this.hiddenIds.delete(this.selectedId);
      this._toast('部件已显示。');
    } else {
      this.hiddenIds.add(this.selectedId);
      this._toast('部件已隐藏；可从结构树或详情面板恢复。');
    }
    this._applyState();
    this._updateDetail();
    this._renderTree();
    this.scene?.setSelection(this.selectedId);
  }

  toggleGhost() {
    if (!this.selectedId) return;
    if (this.ghostIds.has(this.selectedId)) this.ghostIds.delete(this.selectedId);
    else this.ghostIds.add(this.selectedId);
    this._applyState();
    this._updateDetail();
    this._renderTree();
  }

  rotateSelected(axis) {
    if (!this.selectedId || !this.scene) return;
    const node = this.scene.model.getNode(this.selectedId);
    if (!node) return;
    const amount = Math.PI / 4;
    if (axis === 'y') node.manualRotation.y += amount;
    else node.manualRotation.x += amount;
    this._applyState();
    this._updateDetail();
  }

  resetSelectedTransform() {
    if (!this.selectedId || !this.scene) return;
    this.scene.model.clearManual(this.selectedId);
    this.dom.partOffset.value = '0';
    this.dom.partOffsetValue.textContent = '0';
    this._applyState();
    this._updateDetail();
    this._toast('所选部件已归位。');
  }

  toggleManipulation() {
    if (!this.selectedId) {
      this._toast('先选择一个部件，再开始单件拖拽。');
      return;
    }
    if (this.manipulating) {
      this.stopManipulation();
      return;
    }
    this.manipulating = true;
    if (this.scene) this.scene.controls.enabled = false;
    this.dom.canvas.style.cursor = 'move';
    this.dom.manipBanner.hidden = false;
    this.dom.manipBtn.classList.add('is-active');
    this._toast('单件拖拽已开启：在三维画面中拖动所选部件；Esc 退出。');
  }

  stopManipulation() {
    this.manipulating = false;
    this.manipDrag = null;
    if (this.scene) this.scene.controls.enabled = true;
    this.dom.canvas.style.cursor = '';
    this.dom.manipBanner.hidden = true;
    this.dom.manipBtn.classList.remove('is-active');
  }

  /* --------------------------------------------------------------- pointer */
  _onPointerDown(event) {
    if (!this.scene) return;
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.pointerMoved = 0;
    if (this.manipulating && this.selectedId && event.button === 0) {
      const node = this.scene.model.getNode(this.selectedId);
      if (!node) return;
      this.manipDrag = {
        x: event.clientX,
        y: event.clientY,
        offset: node.manualOffset.clone(),
      };
      this.scene.controls.enabled = false;
    }
  }

  _onPointerMove(event) {
    if (!this.scene) return;
    if (this.pointerStart) {
      this.pointerMoved = Math.max(
        this.pointerMoved,
        Math.abs(event.clientX - this.pointerStart.x) + Math.abs(event.clientY - this.pointerStart.y),
      );
    }
    if (this.manipulating && this.manipDrag && this.selectedId) {
      const node = this.scene.model.getNode(this.selectedId);
      if (!node) return;
      const rect = this.dom.canvas.getBoundingClientRect();
      const distance = this.scene.camera.position.distanceTo(this.scene.controls.target);
      const fov = (this.scene.camera.fov * Math.PI) / 180;
      const worldPerPixel = (2 * Math.tan(fov / 2) * distance) / Math.max(1, rect.height);
      const dx = (event.clientX - this.manipDrag.x) * worldPerPixel;
      const dy = (event.clientY - this.manipDrag.y) * worldPerPixel;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      this.scene.camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
      const worldDelta = right.multiplyScalar(dx).add(up.multiplyScalar(-dy));
      const parent = node.object.parent;
      if (parent) {
        const inv = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
        worldDelta.applyQuaternion(inv);
      }
      node.manualOffset.copy(this.manipDrag.offset).add(worldDelta);
      this.dom.partOffset.value = String(Math.round(node.manualOffset.length()));
      this.dom.partOffsetValue.textContent = String(Math.round(node.manualOffset.length()));
      this._applyState();
      return;
    }
    const now = performance.now();
    if (now - this.lastHoverCheck < 45) return;
    this.lastHoverCheck = now;
    if (event.buttons) return;
    const hit = this.scene.pick(event);
    this._setHover(hit?.id ?? null, event);
  }

  _onPointerUp(event) {
    if (!this.scene) return;
    if (this.manipulating && this.manipDrag) {
      this.manipDrag = null;
      this.pointerStart = null;
      this.pointerMoved = 0;
      return;
    }
    if (this.pointerMoved < 7) {
      const hit = this.scene.pick(event);
      if (hit?.id) {
        this.selectPart(hit.id);
      } else if (this.selectedId) {
        this.selectPart(null);
      }
    }
    this.pointerStart = null;
    this.pointerMoved = 0;
  }

  _setHover(id, event = null) {
    if (this.hoveredId === id) {
      if (id && event) this._positionHoverTip(event);
      return;
    }
    this.hoveredId = id;
    this.scene?.setHover(id);
    if (!id) {
      this.dom.hoverTip.hidden = true;
      return;
    }
    const node = this.scene.model.getNode(id);
    if (!node) return;
    this.dom.hoverTip.innerHTML = `<span>${escapeHtml(node.name)}</span><small>点击查看 · ${KIND_LABELS[node.kind] ?? '部件'}</small>`;
    this.dom.hoverTip.hidden = false;
    if (event) this._positionHoverTip(event);
  }

  _positionHoverTip(event) {
    const rect = this.dom.stage.getBoundingClientRect();
    const x = Math.min(rect.width - 170, Math.max(8, event.clientX - rect.left + 14));
    const y = Math.min(rect.height - 60, Math.max(8, event.clientY - rect.top + 14));
    this.dom.hoverTip.style.left = `${x}px`;
    this.dom.hoverTip.style.top = `${y}px`;
  }

  /* ----------------------------------------------------------------- tours */
  runTour(name) {
    const tour = TOURS[name];
    if (!tour) return;
    document.querySelectorAll('[data-sb-tour]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.sbTour === name);
    });
    tour.run(this);
    this._toast(`导览：${tour.label}`);
  }

  /* ------------------------------------------------------------------- info */
  _showInfo(show) {
    this.dom.infoModal.hidden = !show;
    if (show) this.dom.infoClose.focus();
    else document.getElementById('sbInfoBtn')?.focus();
  }

  /* -------------------------------------------------------------------- toast */
  _toast(message, duration = 2800) {
    if (!this.dom.toast) return;
    this.dom.toast.textContent = message;
    this.dom.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.dom.toast.classList.remove('show'), duration);
  }

  setTimeout(callback, ms) {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      if (this.active) callback();
    }, ms);
    this.timers.add(timer);
    return timer;
  }

  dispose() {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.resizeObserver?.disconnect();
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    clearTimeout(this.toastTimer);
    this.scene?.dispose();
    this.scene = null;
    document.body.classList.remove('sb-open');
    this.dom.root.classList.remove('sb-tree-open', 'sb-detail-open');
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
