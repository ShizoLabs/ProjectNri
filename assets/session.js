// BootScene: lightweight loader. Use preload() only for global assets
class BootScene extends Phaser.Scene {
    // Scene ID
    constructor() {
        super({ key: 'BootScene' });
    }
    // Load resources
    preload() {

    }
    // Create main scene
    create() {
        this.scene.start('MainScene');
    }
}

// Main scene
class MainScene extends Phaser.Scene {
    // Scene state: map dimensions, grid size, selected token holder
    constructor() {
        super({ key: 'MainScene' });
        this.mapWidth = 2000;
        this.mapHeight = 2000;
        this.gridSize = 50;
        this.selectedToken = null;
    }

    create() {
        // Read session map settings injected from server (window.SESSION_MAP)
        if (window.SESSION_MAP) {
            this.mapWidth = window.SESSION_MAP.width ?? this.mapWidth;
            this.mapHeight = window.SESSION_MAP.height ?? this.mapHeight;
        }
        /** -----MAP----- */
        // Map size in px
        const mapWidth = this.mapWidth;
        const mapHeight = this.mapHeight;
        // Background rectangle used as visual map area; depth -1 so tokens render above it
        this.map = this.add.rectangle(mapWidth / 2, mapHeight / 2, mapWidth, mapHeight, 0xffffff);
        this.map.setDepth(-1);
        /** -----GRID----- */
        // Draw grid lines. Consider caching to texture if performance drops on large maps
        const gridSize = this.gridSize; // Cell size in px
        const grid = this.add.graphics();
        grid.lineStyle(1, 0x888888, 0.5); // Line style
        for (let x = 0; x <= mapWidth; x += gridSize) { // Vertical lines
            grid.moveTo(x, 0);
            grid.lineTo(x, mapHeight);
        }
        for (let y = 0; y <= mapHeight; y += gridSize) { // Horizonal lines
            grid.moveTo(0, y);
            grid.lineTo(mapWidth, y);
        }
        grid.strokePath(); // Apply lines to map
        grid.setDepth(0); // Grid as neutral layer
        this.gridLayer = grid;
        this.gridVisible = true;
        /** -----TOKENS----- */
        this.tokensGroup = this.add.group();
        // Load token images if needed, then instantiate tokens from SESSION_TOKENS
        const tokensData = Array.isArray(window.SESSION_TOKENS) ? window.SESSION_TOKENS : [];
        const imagePaths = [...new Set(tokensData.map(data => data.imagePath).filter(Boolean))];
        if (imagePaths.length > 0) {
            imagePaths.forEach((path) => {
                const key = this.getTextureKey(path);
                if (!this.textures.exists(key)) {
                    this.load.image(key, path);
                }
            });
            this.load.once(Phaser.Loader.Events.COMPLETE, () => {
                tokensData.forEach((data) => {
                    this.addToken(data);
                });
            });
            this.load.start();
        } else {
            tokensData.forEach((data) => {
                this.addToken(data);
            });
        }
        /** -----CAMERA----- */
        // Camera: bounds, zoom control (wheel) and panning via pointer drag (when not clicking objects)
        this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
        this.cameras.main.setZoom(1);
        this.isPanning = false;
        this.lastPanPoint = null;

        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
            const camera = this.cameras.main;
            const zoomDelta = deltaY * -0.001;
            const nextZoom = Phaser.Math.Clamp(camera.zoom + zoomDelta, 0.2, 2.5);
            camera.setZoom(nextZoom);
        });

        this.input.on('pointerdown', (pointer, gameObjects) => {
            if (gameObjects && gameObjects.length > 0) {
                return;
            }
            this.deselectToken();
            this.isPanning = true;
            this.lastPanPoint = new Phaser.Math.Vector2(pointer.x, pointer.y);
        });

        this.input.on('pointerup', () => {
            this.isPanning = false;
            this.lastPanPoint = null;
        });

        this.input.on('pointermove', (pointer) => {
            if (!this.isPanning || !this.lastPanPoint) {
                return;
            }
            const camera = this.cameras.main;
            const dx = (this.lastPanPoint.x - pointer.x) / camera.zoom;
            const dy = (this.lastPanPoint.y - pointer.y) / camera.zoom;
            camera.scrollX += dx;
            camera.scrollY += dy;
            this.lastPanPoint.set(pointer.x, pointer.y);
        });
    }
    /** Generate a safe key for texture from image path. Be aware of key length and collisions for very long URLs. */ 
    getTextureKey(imagePath) {
        return `token-img-${btoa(imagePath).replace(/=+/g, '')}`;
    }
    /** Keep token label and outline positioned relative to token */
    updateTokenAttachments(token) {
        if (token.selectionOutline) {
            token.selectionOutline.setPosition(token.x, token.y);
        }
        if (token.tokenLabel) {
            const offsetY = (token.tokenSizeY ?? 50) / 2 + 6;
            token.tokenLabel.setPosition(token.x, token.y + offsetY);
        }
    }
    /** Show/hide token outline */
    setTokenSelected(token, selected) {
        if (token.selectionOutline) {
            token.selectionOutline.setVisible(selected);
        }
    }

    addToken(data) {
        // Normalize token input with defaults and safety limits
        const gs = this.gridSize;
        const mapW = this.mapWidth;
        const mapH = this.mapHeight;
        const x = data.x ?? 0;
        const y = data.y ?? 0;
        const sizeX = Math.max(10, Number(data.sizeX ?? 50));
        const sizeY = Math.max(10, Number(data.sizeY ?? 50));
        const rotation = Number(data.rotation ?? 0);
        const color = data.color ?? 0x0000ff;

        let token;
        // If image not loaded, schedule it and re-add token after loader completes
        if (data.imagePath) {
            const key = this.getTextureKey(data.imagePath);
            if (!this.textures.exists(key)) {
                this.load.image(key, data.imagePath);
                this.load.once(Phaser.Loader.Events.COMPLETE, () => {
                    this.addToken(data);
                });
                this.load.start();
                return null;
            }
            token = this.add.image(x, y, key);
            token.setDisplaySize(sizeX, sizeY);
        } else {
            token = this.add.ellipse(x, y, sizeX, sizeY, color);
        }
        // Make token draggable. For ellipse set a precise hitArea to match shape.
        token.setRotation(Phaser.Math.DegToRad(rotation));
        token.setInteractive({ draggable: true });
        if (token.type === 'Ellipse') {
            token.setInteractive(new Phaser.Geom.Ellipse(0, 0, sizeX, sizeY), Phaser.Geom.Ellipse.Contains);
        }
        // Create selection outline and label, set proper depths
        token.tokenSizeX = sizeX;
        token.tokenSizeY = sizeY;

        token.selectionOutline = this.add.rectangle(x, y, sizeX + 8, sizeY + 8);
        token.selectionOutline.setStrokeStyle(2, 0xffff00);
        token.selectionOutline.setFillStyle(0, 0);
        token.selectionOutline.setVisible(false);
        token.selectionOutline.setDepth(1);

        token.tokenLabel = this.add.text(x, y + sizeY / 2 + 6, data.name ?? '', {
            fontSize: '12px',
            color: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.35)',
            padding: { x: 4, y: 2 },
        });
        token.tokenLabel.setOrigin(0.5, 0);
        token.tokenLabel.setDepth(2);
        // Token select / context action.
        token.on('pointerdown', (pointer) => {
            if (pointer.rightButtonDown()) {
                const event = pointer.event;
                if (event && typeof event.preventDefault === 'function') {
                    event.preventDefault();
                }

                if (typeof window.openTokenContextMenu === 'function') {
                    window.openTokenContextMenu({
                        tokenId: token.tokenId,
                        tokenName: token.tokenName,
                        clientX: event?.clientX ?? pointer.x,
                        clientY: event?.clientY ?? pointer.y,
                    });
                }
                return;
            }

            this.selectToken(token);
        });
        // Drag token. Limit token drag by map size
        token.on('drag', (pointer, dragX, dragY) => {
            const halfW = sizeX / 2;
            const halfH = sizeY / 2;
            token.x = Phaser.Math.Clamp(dragX, halfW, mapW - halfW);
            token.y = Phaser.Math.Clamp(dragY, halfH, mapH - halfH);
            this.updateTokenAttachments(token);
        });
        // On dragend snap to grid and persist new position via AJAX. Add error handling & CSRF token.
        token.on('dragend', () => {
            const snappedX = Math.round((token.x - gs / 2) / gs) * gs + gs / 2;
            const snappedY = Math.round((token.y - gs / 2) / gs) * gs + gs / 2;
            // Change position only if was really moved
            if (Math.abs(snappedX - token.x) > 0.0001) token.x = snappedX;
            if (Math.abs(snappedY - token.y) > 0.0001) token.y = snappedY;
            this.updateTokenAttachments(token);
            // Send new position to the server
            $.ajax({
                url: `/token/${token.tokenId}/move`,
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ 
                    x: token.x, 
                    y: token.y, 
                    mapId: token.mapId 
                })
            });
        });
        // Expose token.meta: tokenId, tokenName, mapId for later server calls
        this.tokensGroup.add(token);

        token.tokenId = data.id;
        token.tokenName = data.name ?? '';
        token.mapId = window.SESSION_MAP?.id ?? data.mapId ?? null;
        token.templateId = data.templateId ?? null;

        return token;
    }
    /** selectToken/deselectToken manage visual selection + camera follow */
    selectToken(token) {
        // Если выбран - то перевыбрать
        if (this.selectedToken) {
            this.setTokenSelected(this.selectedToken, false);
        }

        this.selectedToken = token;

        // Визуальное выделение
        this.setTokenSelected(token, true);

        this.cameras.main.startFollow(token, true, 0.08, 0.08);
    }
    /** selectToken/deselectToken manage visual selection + camera follow */
    deselectToken() {
        if (this.selectedToken) {
            this.setTokenSelected(this.selectedToken, false);
        }
        this.selectedToken = null;
        this.cameras.main.stopFollow();
    }
}

// Game config
const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#222222',
    scene: [BootScene, MainScene],
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
};

// Phaser bootstrap: create the game instance with our scenes
const game = new Phaser.Game(config);

// Session UI logic
$(document).ready(function() {
    const sessionFormulas = Array.isArray(window.SESSION_FORMULAS) ? window.SESSION_FORMULAS : [];
    const sessionRollHistory = Array.isArray(window.SESSION_ROLL_HISTORY) ? window.SESSION_ROLL_HISTORY : [];

    const functionPopup = $('#token-function-popup');
    const functionSelect = $('#token-function-select');
    const functionNameInput = $('#token-function-name');
    const functionExpressionInput = $('#token-function-expression');
    const functionTokenIdInput = $('#token-function-token-id');
    const functionTarget = $('#token-function-target');
    const functionRollModeInputs = $('input[name="token-function-roll-mode"]');
    const functionError = $('#token-function-error');
    const functionResultList = $('#function-result-list');
    const chatRollHistoryList = $('#chat-roll-history-list');

    const contextMenu = $('#token-context-menu');
    let contextMenuToken = null;

    const normalizeRollMode = (value) => {
        const mode = String(value ?? '').toLowerCase();
        if (mode === 'advantage' || mode === 'disadvantage') {
            return mode;
        }

        return 'normal';
    };

    const parseRollResults = (payload) => {
        const fromArray = Array.isArray(payload?.results) ? payload.results : [];
        if (fromArray.length > 0) {
            return fromArray.slice(0, 2);
        }

        if (payload?.result !== undefined && payload?.result !== null) {
            return [payload.result];
        }

        return [];
    };

    const appendFunctionResult = (payload, mode = 'prepend') => {
        const safeTokenName = typeof payload?.tokenName === 'string' && payload.tokenName !== '' ? payload.tokenName : 'Unknown token';
        const safeName = typeof payload?.name === 'string' && payload.name !== '' ? payload.name : 'Function';
        const safeExpression = typeof payload?.expression === 'string' ? payload.expression : '';
        const rollMode = normalizeRollMode(payload?.rollMode);
        const results = parseRollResults(payload);
        const selectedIndexRaw = payload?.selectedIndex;
        const selectedIndex = Number.isInteger(selectedIndexRaw) ? Number(selectedIndexRaw) : null;

        const renderIntoList = (list) => {
            if (!list || list.length === 0) {
                return;
            }

            const row = $('<div class="function-result-entry"></div>');
            row.append(
                $('<div class="function-result-entry-title"></div>')
                    .text(`${safeTokenName} -> ${safeName}`)
            );

            if (safeExpression !== '') {
                row.append(
                    $('<div class="function-result-entry-expression"></div>')
                        .text(safeExpression)
                );
            }

            const values = results.length > 0 ? results : [''];
            const resultLine = $('<div class="function-result-entry-results"></div>');
            if (rollMode !== 'normal' && values.length >= 2) {
                resultLine.append(
                    $('<span class="function-result-mode"></span>')
                        .text(rollMode === 'advantage' ? 'Advantage' : 'Disadvantage')
                );
            }

            values.forEach((resultValue, index) => {
                const pill = $('<span class="function-result-pill"></span>').text(String(resultValue));

                if (values.length >= 2 && selectedIndex === index) {
                    if (rollMode === 'advantage') {
                        pill.addClass('function-result-pill-advantage');
                    } else if (rollMode === 'disadvantage') {
                        pill.addClass('function-result-pill-disadvantage');
                    }
                }

                resultLine.append(pill);
            });

            row.append(resultLine);
            if (mode === 'append') {
                list.append(row);
                return;
            }

            list.prepend(row);
        };

        renderIntoList(functionResultList);
        renderIntoList(chatRollHistoryList);
    };

    sessionRollHistory.forEach((historyEntry) => {
        const context = historyEntry?.context;
        if (!context || typeof context !== 'object') {
            return;
        }

        appendFunctionResult({
            tokenName: context.tokenName,
            name: context.name,
            expression: context.expression,
            rollMode: context.rollMode,
            results: context.results,
            selectedIndex: context.selectedIndex,
            result: context.result,
        }, 'append');
    });

    const showFunctionError = (message) => {
        if (typeof message === 'string' && message !== '') {
            functionError.text(message);
            functionError.prop('hidden', false);
            return;
        }

        functionError.text('');
        functionError.prop('hidden', true);
    };

    const closeFunctionPopup = () => {
        functionPopup.prop('hidden', true);
        showFunctionError('');
    };

    const getSelectedFormula = () => {
        const key = String(functionSelect.val() ?? '');
        if (key === '') {
            return null;
        }

        return sessionFormulas.find((formula) => formula && formula.key === key) ?? null;
    };

    const applySelectedFormulaToInputs = () => {
        const selected = getSelectedFormula();
        if (!selected) {
            return;
        }

        functionNameInput.val(selected.name ?? selected.key ?? '');
        functionExpressionInput.val(selected.expression ?? '');
    };

    const openFunctionPopup = (tokenId, tokenName, presetFormulaKey = '') => {
        if (!tokenId) {
            return;
        }

        hideContextMenu();
        functionTokenIdInput.val(String(tokenId));
        functionTarget.text(tokenName ? `Token: ${tokenName}` : 'Token selected');
        functionSelect.val(presetFormulaKey || '');

        if (presetFormulaKey !== '') {
            applySelectedFormulaToInputs();
        } else {
            functionNameInput.val('');
            functionExpressionInput.val('');
        }

        showFunctionError('');
        functionRollModeInputs.filter('[value="normal"]').prop('checked', true);
        functionPopup.prop('hidden', false);
    };

    const hideContextMenu = () => {
        contextMenu.prop('hidden', true);
        contextMenuToken = null;
    };

    window.openTokenContextMenu = (payload) => {
        if (!payload || !payload.tokenId) {
            return;
        }

        contextMenuToken = {
            id: String(payload.tokenId),
            name: payload.tokenName ? String(payload.tokenName) : '',
        };

        contextMenu.css({
            left: `${Math.max(8, Number(payload.clientX ?? 0))}px`,
            top: `${Math.max(8, Number(payload.clientY ?? 0))}px`,
        });
        contextMenu.prop('hidden', false);
    };

    const runFunctionForCurrentPopupToken = () => {
        const tokenId = String(functionTokenIdInput.val() ?? '').trim();
        if (tokenId === '') {
            showFunctionError('Token id is missing.');
            return;
        }

        const selectedFormula = getSelectedFormula();
        const payload = {
            sessionId: window.SESSION_ID,
            name: String(functionNameInput.val() ?? '').trim(),
            expression: String(functionExpressionInput.val() ?? '').trim(),
            formulaKey: selectedFormula?.key ?? '',
            rollMode: normalizeRollMode(functionRollModeInputs.filter(':checked').val()),
        };

        $.ajax({
            url: `/token/${tokenId}/run-function`,
            method: 'POST',
            contentType: 'application/json',
            dataType: 'json',
            data: JSON.stringify(payload),
            success: function(response) {
                if (!response || response.ok !== true) {
                    showFunctionError(response?.error ?? 'Cannot run function.');
                    return;
                }

                appendFunctionResult(response);
                closeFunctionPopup();
            },
            error: function(xhr) {
                const message = xhr?.responseJSON?.error ?? 'Cannot run function.';
                showFunctionError(message);
            }
        });
    };

    sessionFormulas.forEach((formula) => {
        if (!formula || typeof formula !== 'object' || typeof formula.key !== 'string' || formula.key === '') {
            return;
        }

        const optionLabel = typeof formula.name === 'string' && formula.name !== '' ? formula.name : formula.key;
        functionSelect.append(
            $('<option></option>')
                .attr('value', formula.key)
                .text(optionLabel)
        );
    });

    functionSelect.on('change', applySelectedFormulaToInputs);
    functionExpressionInput.on('input', function() {
        // Any manual expression edit means we are no longer using a predefined formula.
        if (String(functionSelect.val() ?? '') !== '') {
            functionSelect.val('');
        }
    });
    $('#token-function-run').on('click', runFunctionForCurrentPopupToken);
    $('#token-function-close').on('click', closeFunctionPopup);

    $(document).on('keydown', function(event) {
        if (event.key === 'Escape') {
            hideContextMenu();
            if (!functionPopup.prop('hidden')) {
                closeFunctionPopup();
            }
        }
    });

    $(document).on('click', function(event) {
        const target = $(event.target);
        if (!target.closest('#token-context-menu').length) {
            hideContextMenu();
        }
    });

    $('#token-context-run-function').on('click', function() {
        if (!contextMenuToken) {
            hideContextMenu();
            return;
        }

        openFunctionPopup(contextMenuToken.id, contextMenuToken.name);
        hideContextMenu();
    });

    $(document).on('contextmenu', '#game-container', function(event) {
        event.preventDefault();
    });

    $(document).on('click', '.token-function-btn', function() {
        const row = $(this).closest('.token-row');
        const tokenId = row.data('token-id');
        const tokenName = row.data('token-name');
        openFunctionPopup(tokenId, tokenName);
    });

    // Toggle map list panel open/close
    $('#map-list-toggle').click(function() {
        $('#map-list-panel').toggleClass('is-open');
    });

    // Switch map by reloading page with ?map=mapId (server uses GET param to select map)
    $(document).on('click', '.map-switch-btn', function() {
        const mapId = $(this).data('map-id');
        if (!mapId) {
            return;
        }
        const baseUrl = window.SESSION_OPEN_URL || `/session/${window.SESSION_ID}`;
        window.location.href = `${baseUrl}?map=${mapId}`;
    });

    // Place token on map: server creates/updates token record (spawn) and returns token data, then we add to scene
    $('.token-place-btn').click(function() {
        const row = $(this).closest('.token-row');
        const tokenId = row.data('token-id');
        const mapId = window.SESSION_MAP?.id;

        if (!tokenId || !mapId) {
            return;
        }

        const scene = game.scene.keys.MainScene;
        const gs = scene.gridSize;
        const startX = Math.round(scene.mapWidth / 2 / gs) * gs + gs / 2;
        const startY = Math.round(scene.mapHeight / 2 / gs) * gs + gs / 2;

        $.ajax({
            url: `/token/${tokenId}/spawn`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ x: startX, y: startY, mapId }),
            dataType: 'json',
            success: function(data) {
                if (!data || !data.id) return;

                scene.addToken({
                    ...data,
                    x: startX,
                    y: startY,
                    mapId,
                });
            },
            error: function(xhr, status, error) {
                console.error('Error spawning token', status, error);
            }
        });
    });

    // Drag from list to map
    $(document).on('dragstart', '.token-row', function(event) {
        const tokenId = $(this).data('token-id');
        if (!tokenId) {
            return;
        }
        event.originalEvent.dataTransfer.setData('text/plain', String(tokenId));
    });

    $('#game-container').on('dragover', function(event) {
        event.preventDefault();
    });

    $('#game-container').on('drop', function(event) {
        event.preventDefault();
        const tokenId = event.originalEvent.dataTransfer.getData('text/plain');
        const mapId = window.SESSION_MAP?.id;
        if (!tokenId || !mapId) {
            return;
        }

        const scene = game.scene.keys.MainScene;
        const camera = scene.cameras.main;
        const rect = game.canvas.getBoundingClientRect();
        const localX = event.originalEvent.clientX - rect.left;
        const localY = event.originalEvent.clientY - rect.top;
        const worldPoint = camera.getWorldPoint(localX, localY);

        $.ajax({
            url: `/token/${tokenId}/spawn`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ x: worldPoint.x, y: worldPoint.y, mapId }),
            dataType: 'json',
            success: function(data) {
                if (!data || !data.id) return;

                scene.addToken({
                    ...data,
                    x: worldPoint.x,
                    y: worldPoint.y,
                    mapId,
                });
            },
            error: function(xhr, status, error) {
                console.error('Error spawning token', status, error);
            }
        });
    });

    // Switch tabs in controll menu (right side)
    $('.tab-btn').click(function() {
        const tabId = $(this).data('tab');

        $('.tab-btn').removeClass('active');
        $(this).addClass('active');

        $('.tab').hide();

        $('#' + tabId).show();
    });

    // Map tool buttons: zoom, center, toggle grid, remove selected token (server call)
    $('.tool-btn').click(function() {
        const tool = $(this).data('tool');
        const scene = game.scene.keys.MainScene;
        if (!scene) {
            return;
        }
        const camera = scene.cameras.main;

        switch (tool) {
            case 'zoom-in': {
                const nextZoom = Phaser.Math.Clamp(camera.zoom + 0.1, 0.2, 2.5);
                camera.setZoom(nextZoom);
                break;
            }
            case 'zoom-out': {
                const nextZoom = Phaser.Math.Clamp(camera.zoom - 0.1, 0.2, 2.5);
                camera.setZoom(nextZoom);
                break;
            }
            case 'zoom-reset':
                camera.setZoom(1);
                break;
            case 'center-map':
                camera.centerOn(scene.mapWidth / 2, scene.mapHeight / 2);
                break;
            case 'toggle-grid':
                scene.gridVisible = !scene.gridVisible;
                if (scene.gridLayer) {
                    scene.gridLayer.setVisible(scene.gridVisible);
                }
                break;
            case 'remove-token': {
                const token = scene.selectedToken;
                if (!token || !token.tokenId) {
                    return;
                }
                $.ajax({
                    url: `/token/${token.tokenId}/remove`,
                    method: 'POST',
                    contentType: 'application/json',
                    success: function() {
                        if (token.tokenLabel) {
                            token.tokenLabel.destroy();
                        }
                        if (token.selectionOutline) {
                            token.selectionOutline.destroy();
                        }
                        token.destroy();
                        scene.selectedToken = null;
                        scene.cameras.main.stopFollow();
                    },
                    error: function(xhr, status, error) {
                        console.error('Error removing token', status, error);
                    }
                });
                break;
            }
            default:
                break;
        }
    });

    // Delete template token and all clones
    $(document).on('click', '.token-delete-btn', function() {
        const row = $(this).closest('.token-row');
        const tokenId = row.data('token-id');
        if (!tokenId) {
            return;
        }

        $.ajax({
            url: `/token/${tokenId}/remove`,
            method: 'POST',
            contentType: 'application/json',
            success: function() {
                row.remove();
                const scene = game.scene.keys.MainScene;
                if (!scene) return;

                const children = scene.tokensGroup.getChildren();
                for (let i = children.length - 1; i >= 0; i--) {
                    const token = children[i];
                    if (token.templateId === tokenId) {
                        if (token.tokenLabel) token.tokenLabel.destroy();
                        if (token.selectionOutline) token.selectionOutline.destroy();
                        token.destroy();
                    }
                }
            },
            error: function(xhr, status, error) {
                console.error('Error removing token', status, error);
            }
        });
    });
});
