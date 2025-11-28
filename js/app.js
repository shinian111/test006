class FaultTreeApp {

  constructor() {

    // 获取页面元素

    this.treeContainer = document.getElementById('treeContainer');

    this.contentArea = document.getElementById('contentArea');

    this.notesPanel = document.getElementById('notesPanel');

    this.searchInput = document.getElementById('searchInput');

    this.breadcrumb = document.getElementById('breadcrumb');


    // 初始化变量

    this.currentPath = [];

    this.globalNotes = [];

    this.loadedNodes = new Map();

    this.imagePreloader = new Set();


    this.init();

  }


  async init() {

    // 加载故障树数据

    await this.loadTree('data/main.json');

    // 绑定事件

    this.bindEvents();

  }


  async loadTree(jsonPath) {

    try {

      // 获取JSON数据

      const data = await this.fetchJSON(jsonPath);

      // 构建故障树

      this.buildTree(data, null, jsonPath);

    } catch (err) {

      // 显示错误信息

      this.showError(`无法加载主配置文件: ${err.message}`);

    }

  }


  async fetchJSON(path) {

    // 发送GET请求

    const res = await fetch(path + '?t=' + new Date().getTime());

    // 检查HTTP状态码

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // 解析JSON响应

    return await res.json();

  }


  buildTree(data, parentElement, basePath) {

    // 创建文档片段

    const fragment = document.createDocumentFragment();


    // 遍历数据并创建树节点

    data.forEach((item, index) => {

      const node = this.createTreeNode(item, basePath, index);

      fragment.appendChild(node);

    });


    // 如果有父元素，则替换父元素内容

    if (parentElement) {

      parentElement.innerHTML = '';

      parentElement.appendChild(fragment);

    } else {

      // 如果没有父元素，则添加到树容器

      this.treeContainer.appendChild(fragment);

    }

  }


  createTreeNode(item, basePath, key) {

    // 创建列表项元素

    const li = document.createElement('ul');

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


    // 创建图标元素

    const iconSpan = document.createElement('span');

                iconSpan.className = 'icon';

               

                // 设置图标

                if (item.type === 'folder') {

                    iconSpan.innerHTML = '<i class="fas fa-folder"></i>';

                } else {

                    iconSpan.innerHTML = '<i class="fas fa-file-medical"></i>';

                }

               

                li.appendChild(iconSpan);


    // 创建标题元素

    const titleSpan = document.createElement('span');

    titleSpan.className = 'title';

    titleSpan.textContent = item.title;

    li.appendChild(titleSpan);


    // 绑定点击事件

    li.addEventListener('click', (e) => {

      e.stopPropagation();

      this.selectNode(li, item, basePath);

    });


    return li;

  }


  async selectNode(element, item, basePath) {

    // 移除其他节点的激活状态

    document.querySelectorAll('.tree-node.active').forEach(n => n.classList.remove('active'));

    // 添加当前节点的激活状态

    element.classList.add('active');


    // 获取面包屑路径

    this.currentPath = this.getBreadcrumbPath(element);

    // 更新继承的注释

    this.updateInheritedNotes();

    // 渲染面包屑

    this.renderBreadcrumb();


    if (item.type === 'page') {

      // 渲染内容

      this.renderContent(item);

      // 预加载内容中的图片

      this.preloadImagesInContent(item);

    } else {

      if (element.classList.contains('expanded')) {

        // 折叠节点

        this.collapseNode(element);

      } else {

        // 展开节点

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

      if (parent && parent!== curr) {

        curr = parent;

      } else {

        break;

      }

    }

    return path;

  }


  renderBreadcrumb() {

    const parts = this.currentPath.map(p => p.title);

    this.breadcrumb.innerHTML = parts.length > 0? '路径: ' parts.join(' > ') : '';

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

    // 创建子节点容器

    const childrenContainer = document.createElement('li');

    childrenContainer.className = 'tree-children';

    parentNode.parentNode.insertBefore(childrenContainer, parentNode.nextSibling);

    parentNode.dataset.container = 'true';

    parentNode.classList.add('expanded');


    let data = [];

    if (item.children) {

      data = item.children;

    }

else if (item.source) {

      const fullPath = this.resolvePath(basePath, item.source);

      if (this.loadedNodes.has(fullPath)) {

        data = this.loadedNodes.get(fullPath);

      } else {

        data = await this.fetchJSON(fullPath);

        this.loadedNodes.set(fullPath, data);

      }


    }

    // 更新文件夹图标

                const icon = parentNode.querySelector('.icon i');

                icon.classList.remove('fa-folder');

                icon.classList.add('fa-folder-open');


    // 构建子节点

    this.buildTree(data, childrenContainer, item.source || basePath);

  }


  collapseNode(parentNode) {

    // 获取下一个兄弟节点

    const next = parentNode.nextSibling;

    if (next && next.classList.contains('tree-children')) {

      // 删除子节点容器

      next.remove();

    }

    // 移除展开状态

    parentNode.classList.remove('expanded');

    // 更新文件夹图标

                const icon = parentNode.querySelector('.icon i');

                icon.classList.remove('fa-folder-open');

                icon.classList.add('fa-folder');

  }


  resolvePath(base, target) {

    // 获取基础路径目录

    const baseDir = base.substring(0, base.lastIndexOf('/') + 1);

    // 返回完整路径

    return target.startsWith('data/')? target : baseDir + target;

  }


  findItemByPathAndKey(jsonPath, key) {

    // 获取完整路径

    const fullPath = jsonPath && jsonPath.includes('data/')? jsonPath : 'data/main.json';

    // 获取缓存的数据

    const cached = this.loadedNodes.get(fullPath) || this.loadedNodes.get('data/main.json');

    if (!cached) return null;

    // 递归查找指定键的数据项

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


    //if (item.content) {html += `<p>${item.content}</p>`;}


 if (item.measures && item.measures.length > 0) {

      html += `<h3 class="info-header"><i class="fas fa-search"></i>维修措施</h3><ul>`;

      item.measures.forEach(m => {

        html += `<li>${m}</li>`;

      });

      html += `</ul>`;

    }


    if (item.rootCause) {

      html += `<h3 class="info-header"><i class="fas fa-tools"></i>根本原因</h3><p>${item.rootCause}</p>`;

    }


   


    // 渲染内容到页面

    this.contentArea.innerHTML = html || '<p class="placeholder">暂无内容。</p>';

  }


  preloadImagesInContent(item) {

    // 合并所有可能的文本内容

    const combined = [

      item.content || '',

      item.rootCause || '',

     ...(item.measures || [])

    ].join(' ');


    // 使用正则表达式匹配图片源

    const imgRegex = /<image[^>]+src=['"]([^'"]+)['"]/g;

    let match;

    while ((match = imgRegex.exec(combined))) {

      const src = match[1];

      if (!this.imagePreloader.has(src)) {

        // 创建图片对象并预加载

        const img = new Image();

        img.src = src;

        this.imagePreloader.add(src);

      }

    }

  }


  bindEvents() {

    // 搜索功能事件监听

    this.searchInput.addEventListener('input', (e) => {

      this.filterTree(e.target.value.trim());

    });

  }


  filterTree(keyword) {

    // 隐藏"未找到结果"消息

    this.noResults.style.display = 'none';

   

    // 获取所有树节点

    const nodes = document.querySelectorAll('.tree-node');

    let found = false;


    // 如果没有搜索词，重置所有节点显示

    if (!keyword) {

      nodes.forEach(node => {

        node.style.display = '';

        // 显示所有子节点容器

        const childrenContainer = node.nextElementSibling;

        if (childrenContainer && childrenContainer.classList.contains('tree-children')) {

          childrenContainer.style.display = '';

        }

      });

      return;

    }


    // 转换为小写用于不区分大小写的搜索

    const searchTerm = keyword.toLowerCase();


    // 遍历所有节点进行搜索

    nodes.forEach(node => {

      const title = node.querySelector('.title').textContent.toLowerCase();

     

      if (title.includes(searchTerm)) {

        // 如果匹配，显示节点

        node.style.display = '';

       

        // 展开所有父节点

        this.expandParentNodes(node);

       

        found = true;

      } else {

        // 如果不匹配，隐藏节点

        node.style.display = 'none';

       

        // 隐藏对应的子节点容器

        const childrenContainer = node.nextElementSibling;

        if (childrenContainer && childrenContainer.classList.contains('tree-children')) {

          childrenContainer.style.display = 'none';

        }

      }

    });


    // 如果没有找到匹配项，显示提示消息

    if (!found) {

      this.noResults.style.display = 'block';

    }

  }


  // 展开匹配节点的所有父节点

  expandParentNodes(node) {

    let currentNode = node;

   

    // 向上遍历所有父节点

    while (currentNode) {

      // 获取当前节点的父节点（tree-node）

      const parentNode = currentNode.parentElement.closest('.tree-node');

     

      if (parentNode) {

        // 显示父节点

        parentNode.style.display = '';

       

        // 如果父节点有子节点容器，显示并展开

        const childrenContainer = parentNode.nextElementSibling;

        if (childrenContainer && childrenContainer.classList.contains('tree-children')) {

          childrenContainer.style.display = '';

          parentNode.classList.add('expanded');

        }

       

        currentNode = parentNode;

      } else {

        // 没有更多父节点，退出循环

        break;

      }

    }

  }


  showError(msg) {

    this.contentArea.innerHTML = `<p style="color:#f48484;">❌❌ ${msg}</p>`;

  }

}


// ​

document.addEventListener('DOMContentLoaded', () => {

  // 页面加载完成后初始化应用

  new FaultTreeApp();

});
