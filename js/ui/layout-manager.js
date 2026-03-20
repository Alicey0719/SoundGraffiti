/**
 * Layout Manager - メーターパネルの表示管理とドラッグ&ドロップ
 * 各メーターの表示・非表示を制御し、レイアウト設定を保存
 */

class LayoutManager {
    constructor() {
        this.storageKey = 'soundGraffiti_layout';
        this.orderKey = 'soundGraffiti_order';
        this.panels = {
            lufs: document.getElementById('lufs-panel'),
            truepeak: document.getElementById('truepeak-panel'),
            vu: document.getElementById('vu-panel'),
            spectrum: document.getElementById('spectrum-panel'),
            stereofield: document.getElementById('stereofield-panel'),
            history: document.getElementById('history-panel')
        };
        
        this.draggedElement = null;
        this.container = document.getElementById('meters-container');
        
        this.init();
    }
    
    init() {
        // 保存されたレイアウトを読み込み
        this.loadLayout();
        
        // ドラッグ&ドロップ機能のセットアップ
        this.setupDragAndDrop();
    }
    
    toggleMeter(meterName, visible) {
        const panel = this.panels[meterName];
        
        if (!panel) {
            console.warn(`Panel not found: ${meterName}`);
            return;
        }
        
        if (visible) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
        
        // レイアウトを保存
        this.saveLayout();
    }
    
    saveLayout() {
        const layout = {};
        
        for (const [name, panel] of Object.entries(this.panels)) {
            layout[name] = !panel.classList.contains('hidden');
        }
        
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(layout));
        } catch (e) {
            console.warn('Failed to save layout to localStorage:', e);
        }
    }
    
    loadLayout() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            
            if (!saved) {
                return; // デフォルト表示のまま
            }
            
            const layout = JSON.parse(saved);
            
            // レイアウトを適用
            for (const [name, visible] of Object.entries(layout)) {
                const panel = this.panels[name];
                const checkbox = document.querySelector(`input[data-meter="${name}"]`);
                
                if (panel) {
                    if (visible) {
                        panel.classList.remove('hidden');
                    } else {
                        panel.classList.add('hidden');
                    }
                }
                
                if (checkbox) {
                    checkbox.checked = visible;
                }
            }
            
            console.log('Layout loaded from localStorage');
        } catch (e) {
            console.warn('Failed to load layout from localStorage:', e);
        }
    }
    
    resetLayout() {
        // すべてのパネルを表示
        for (const panel of Object.values(this.panels)) {
            panel.classList.remove('hidden');
        }
        
        // チェックボックスもすべてON
        const checkboxes = document.querySelectorAll('.meter-toggle');
        checkboxes.forEach(cb => cb.checked = true);
        
        // 順序もリセット
        localStorage.removeItem(this.orderKey);
        
        // 保存
        this.saveLayout();
        
        console.log('Layout reset to default');
    }
    
    setupDragAndDrop() {
        // 各パネルのヘッダーでドラッグ開始
        Object.values(this.panels).forEach(panel => {
            const header = panel.querySelector('.panel-header');
            
            header.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.startDrag(panel, e);
            });
            
            // タッチデバイス対応
            header.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.startDrag(panel, e.touches[0]);
            });
            
            // ホバーエフェクト
            header.addEventListener('mouseenter', () => {
                if (!this.draggedElement) {
                    panel.style.transform = 'translateY(-2px)';
                    panel.style.transition = 'transform 0.2s ease';
                }
            });
            
            header.addEventListener('mouseleave', () => {
                if (!this.draggedElement) {
                    panel.style.transform = '';
                }
            });
        });
        
        // パネル順序の復元
        this.loadOrder();
    }
    
    startDrag(panel, event) {
        this.draggedElement = panel;
        
        // パネルの初期位置とサイズを取得
        const rect = panel.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        
        // 元のインデックスを保存
        this.originalIndex = Array.from(this.container.children).indexOf(panel);
        
        // プレースホルダーを作成
        const placeholder = document.createElement('div');
        placeholder.className = 'meter-panel drag-placeholder';
        placeholder.style.minHeight = rect.height + 'px';
        
        // wideクラスを継承
        if (panel.classList.contains('wide')) {
            placeholder.classList.add('wide');
        }
        
        panel.parentNode.insertBefore(placeholder, panel);
        this.placeholder = placeholder;
        
        // ドラッグ中のパネルをfixedに設定
        panel.classList.add('dragging');
        panel.style.width = rect.width + 'px';
        panel.style.height = rect.height + 'px';
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
        
        let lastTargetPanel = null;
        
        const onMove = (e) => {
            e.preventDefault();
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);
            
            // パネルをマウスカーソルに追従
            panel.style.left = (clientX - offsetX) + 'px';
            panel.style.top = (clientY - offsetY) + 'px';
            
            // マウス位置の中心点を使って判定（より直感的）
            const centerX = clientX;
            const centerY = clientY;
            
            // ドロップ先を判定
            const targetInfo = this.getDropTarget(centerX, centerY);
            
            // ハイライトを更新
            this.container.querySelectorAll('.meter-panel').forEach(p => {
                if (p !== panel && p !== this.placeholder) {
                    p.classList.remove('drag-over');
                }
            });
            
            if (targetInfo) {
                const { targetPanel, insertBefore } = targetInfo;
                
                if (targetPanel !== lastTargetPanel) {
                    lastTargetPanel = targetPanel;
                    
                    if (insertBefore) {
                        targetPanel.parentNode.insertBefore(this.placeholder, targetPanel);
                    } else {
                        targetPanel.parentNode.insertBefore(this.placeholder, targetPanel.nextSibling);
                    }
                }
                
                if (targetPanel !== this.placeholder) {
                    targetPanel.classList.add('drag-over');
                }
            }
        };
        
        const onEnd = () => {
            // プレースホルダーの位置にパネルを戻す
            this.placeholder.parentNode.insertBefore(panel, this.placeholder);
            this.placeholder.remove();
            this.placeholder = null;
            
            panel.classList.remove('dragging');
            panel.style.width = '';
            panel.style.height = '';
            panel.style.left = '';
            panel.style.top = '';
            panel.style.position = '';
            
            this.draggedElement = null;
            lastTargetPanel = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            // ハイライトをクリア
            this.container.querySelectorAll('.meter-panel').forEach(p => {
                p.classList.remove('drag-over');
            });
            
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
            
            // 順序を保存
            this.saveOrder();
        };
        
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
    }
    
    getDropTarget(x, y) {
        const panels = [...this.container.querySelectorAll('.meter-panel:not(.dragging):not(.drag-placeholder)')].filter(p => !p.classList.contains('hidden'));
        
        if (panels.length === 0) {
            return null;
        }
        
        let closestPanel = null;
        let closestDistance = Infinity;
        let insertBefore = false;
        
        for (const panel of panels) {
            const rect = panel.getBoundingClientRect();
            
            // パネルの4つの境界
            const left = rect.left;
            const right = rect.right;
            const top = rect.top;
            const bottom = rect.bottom;
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            // マウスがパネルの領域内にあるか判定
            const isInHorizontalRange = x >= left && x <= right;
            const isInVerticalRange = y >= top && y <= bottom;
            
            // パネル内にマウスがある場合
            if (isInHorizontalRange && isInVerticalRange) {
                closestPanel = panel;
                // 中心より上なら前に、下なら後ろに挿入
                insertBefore = (y < centerY);
                closestDistance = 0;
                break;
            }
            
            // パネル外の場合、最も近いパネルを探す
            // 垂直方向の重なりを重視
            let distance;
            
            if (isInHorizontalRange) {
                // 横は重なっている場合、縦の距離だけで判定
                distance = Math.min(Math.abs(y - top), Math.abs(y - bottom));
                insertBefore = (y < centerY);
            } else if (isInVerticalRange) {
                // 縦は重なっている場合、横の距離だけで判定
                distance = Math.min(Math.abs(x - left), Math.abs(x - right));
                insertBefore = (x < centerX);
            } else {
                // 両方重なっていない場合、中心点までの距離
                distance = Math.sqrt(
                    Math.pow(x - centerX, 2) + 
                    Math.pow(y - centerY, 2)
                );
                
                // 挿入位置を判定（4象限で判定）
                const dx = x - centerX;
                const dy = y - centerY;
                
                if (Math.abs(dy) > Math.abs(dx)) {
                    // 主に上下方向
                    insertBefore = (dy < 0);
                } else {
                    // 主に左右方向
                    insertBefore = (dx < 0);
                }
            }
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestPanel = panel;
            }
        }
        
        return closestPanel ? { targetPanel: closestPanel, insertBefore } : null;
    }
    
    saveOrder() {
        const order = [];
        const panels = this.container.querySelectorAll('.meter-panel:not(.drag-placeholder)');
        
        panels.forEach(panel => {
            const meterId = panel.getAttribute('data-meter');
            if (meterId) {
                order.push(meterId);
            }
        });
        
        try {
            localStorage.setItem(this.orderKey, JSON.stringify(order));
            console.log('Panel order saved:', order);
        } catch (e) {
            console.warn('Failed to save panel order:', e);
        }
    }
    
    loadOrder() {
        try {
            const saved = localStorage.getItem(this.orderKey);
            
            if (!saved) {
                return;
            }
            
            const order = JSON.parse(saved);
            
            // 保存された順序でパネルを並び替え
            order.forEach((meterId, index) => {
                const panel = this.panels[meterId];
                if (panel && this.container.contains(panel)) {
                    this.container.appendChild(panel);
                }
            });
            
            console.log('Panel order loaded:', order);
        } catch (e) {
            console.warn('Failed to load panel order:', e);
        }
    }
}
