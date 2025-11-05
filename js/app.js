class FaultTreeApp {
  constructor() {
    this.treeContainer = document.getElementById('treeContainer');
    this.contentArea = document.getElementById('contentArea');
    this.notesPanel = document.getElementById('notesPanel');
    this.searchInput = document.getElementById('searchInput');
    this.breadcrumb = document.getElementById('breadcrumb');

    this.currentPath = [];
    this.globalNotes = [];
    this.loadedNodes = new Map();
    this.imagePreloader = new Set();

    this.init();
  }

  async init() {
    await this.loadTree('data/main.json');
    this.bindEvents();
  }

  async loadTree(jsonPath) {
    try {
      const data = await this.fetchJSON(jsonPath);
      this.buildTree(data, null, jsonPath);
    } catch (err) {
      this.showError(`无法加载主配置文件: ${err.message}`);
    }
  }

  async fetchJSON(path) {
    const res = await fetch(path + '?t=' + new Date().getTime());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  buildTree(data, parentElement, basePath) {
    const fragment = document.createDocumentFragment();

    data.forEach((item, index) => {
      const node = this.createTreeNode(item, basePath, index);
      fragment.appendChild(node);
    });

    if (parentElement) {
      parentElement.innerHTML = '';
      parentElement.appendChild(fragment);
    } else {
      this.treeContainer.appendChild(fragment);
    }
  }

  createTreeNode(item, basePath, key) {
    const li = document.createElement('div');
    li.className = 'tree-node';
    li.dataset.key = key;
    li.dataset.path = basePath;

    let hasChildren = false;
    if (item.type === 'folder') {
      hasChildren = true;
      if (item.children && item.children.length > 0) {
        li.classList.add('children');
      } else if (item.source) {
        li.classList.add('children');
      }
    }

    if (!hasChildren && item.type === 'page') {
      li.classList.add('leaf');
    }

    const iconSpan = document.createElement('span');
    iconSpan.className = 'icon';
    li.appendChild(iconSpan);

    const titleSpan = document.createElement('span');
    titleSpan.className = 'title';
    titleSpan.textContent = item.title;
    li.appendChild(titleSpan);

    li.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectNode(li, item, basePath);
    });

    return li;
  }

  async selectNode(element, item, basePath) {
    document.querySelectorAll('.tree-node.active').forEach(n => n.classList.remove('active'));
    element.classList.add('active');

    this.currentPath = this.getBreadcrumbPath(element);
    this.updateInheritedNotes();
    this.renderBreadcrumb();

    if (item.type === 'page') {
      this.renderContent(item);
      this.preloadImagesInContent(item);
    } else {
      if (element.classList.contains('expanded')) {
        this.collapseNode(element);
      } else {
        await this.expandNode(element, item, basePath);
      }
    }
  }

  getBreadcrumbPath(element) {
    const path = [];
    let curr = element;
    while (curr && curr.classList.contains('tree-node')) {
      const title = curr.querySelector('.title').textContent;
      path.unshift({ title, element: curr });
      const parent = curr.parentElement.closest('.tree-node');
      if (parent && parent !== curr) {
        curr = parent;
      } else {
        break;
      }
    }
    return path;
  }

  renderBreadcrumb() {
    const parts = this.currentPath.map(p => p.title);
    this.breadcrumb.innerHTML = parts.length > 0 ? '路径: ' + parts.join(' > ') : '';
  }

  updateInheritedNotes() {
    const notes = [];
    let tempPath = [...this.currentPath];

    while (tempPath.length > 0) {
      const step = tempPath.shift();
      const el = step.element;
      const key = el.dataset.key;
      const path = el.dataset.path;
      const data = this.findItemByPathAndKey(path, key);
      if (data && data.notes) {
        notes.unshift(data.notes);
      }
    }

    if (notes.length > 0) {
      this.notesPanel.innerHTML = notes.map(n => `⚠️ ${n}`).join('<br>');
      this.notesPanel.classList.remove('hidden');
    } else {
      this.notesPanel.classList.add('hidden');
    }
  }

  async expandNode(parentNode, item, basePath) {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children';
    parentNode.parentNode.insertBefore(childrenContainer, parentNode.nextSibling);
    parentNode.dataset.container = 'true';
    parentNode.classList.add('expanded');

    let data = [];
    if (item.children) {
      data = item.children;
    } else if (item.source) {
      const fullPath = this.resolvePath(basePath, item.source);
      if (this.loadedNodes.has(fullPath)) {
        data = this.loadedNodes.get(fullPath);
      } else {
        data = await this.fetchJSON(fullPath);
        this.loadedNodes.set(fullPath, data);
      }
    }

    this.buildTree(data, childrenContainer, item.source || basePath);
  }

  collapseNode(parentNode) {
    const next = parentNode.nextSibling;
    if (next && next.classList.contains('tree-children')) {
      next.remove();
    }
    parentNode.classList.remove('expanded');
  }

  resolvePath(base, target) {
    const baseDir = base.substring(0, base.lastIndexOf('/') + 1);
    return target.startsWith('data/') ? target : baseDir + target;
  }

  findItemByPathAndKey(jsonPath, key) {
    const fullPath = jsonPath && jsonPath.includes('data/') ? jsonPath : 'data/main.json';
    const cached = this.loadedNodes.get(fullPath) || this.loadedNodes.get('data/main.json');
    if (!cached) return null;
    return this.traverseToFind(cached, parseInt(key));
  }

  traverseToFind(arr, key, depth = 0) {
    for (let i = 0; i < arr.length; i++) {
      if (i === key && depth === 0) return arr[i];
      if (arr[i].children) {
        const found = this.traverseToFind(arr[i].children, key, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  renderContent(item) {
    let html = '';

    if (item.content) {
      html += `<p>${item.content}</p>`;
    }

    if (item.rootCause) {
      html += `<div class="section-title">📌 故障根本原因</div><p>${item.rootCause}</p>`;
    }

    if (item.measures && item.measures.length > 0) {
      html += `<div class="section-title">✅ 处理措施</div><ul>`;
      item.measures.forEach(m => {
        html += `<li>${m}</li>`;
      });
      html += `</ul>`;
    }

    this.contentArea.innerHTML = html || '<p class="placeholder">暂无内容。</p>';
  }

  preloadImagesInContent(item) {
    const combined = [
      item.content || '',
      item.rootCause || '',
      ...(item.measures || [])
    ].join(' ');

    const imgRegex = /<image[^>]+src=['"]([^'"]+)['"]/g;
    let match;
    while ((match = imgRegex.exec(combined))) {
      const src = match[1];
      if (!this.imagePreloader.has(src)) {
        const img = new Image();
        img.src = src;
        this.imagePreloader.add(src);
      }
    }
  }

  bindEvents() {
    this.searchInput.addEventListener('input', (e) => {
      this.filterTree(e.target.value.trim());
    });
  }

  filterTree(keyword) {
    if (!keyword) {
      document.querySelectorAll('.tree-children, .tree-node').forEach(el => {
        el.style.display = '';
      });
      return;
    }

    const allNodes = document.querySelectorAll('.tree-node');
    const matched = new Set();

    allNodes.forEach(node => {
      const title = node.querySelector('.title').textContent;
      if (title.includes(keyword)) {
        this.markNodeAndParents(node, matched);
      }
    });

    allNodes.forEach(node => {
      if (matched.has(node)) {
        node.style.display = '';
        const parentChildren = node.nextSibling;
        if (parentChildren && parentChildren.classList.contains('tree-children')) {
          parentChildren.style.display = '';
        }
      } else {
        node.style.display = 'none';
        const children = node.nextSibling;
        if (children && children.classList.contains('tree-children')) {
          children.style.display = 'none';
        }
      }
    });
  }

  markNodeAndParents(node, set) {
    let curr = node;
    while (curr) {
      set.add(curr);
      const parentLi = curr.parentElement.closest('.tree-node');
      if (parentLi) {
        curr = parentLi;
      } else {
        break;
      }
    }
  }

  showError(msg) {
    this.contentArea.innerHTML = `<p style="color:#f48484;">❌ ${msg}</p>`;
  }
}

// 启动
document.addEventListener('DOMContentLoaded', () => {
  new FaultTreeApp();
});
