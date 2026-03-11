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
        this.feetPerCell = 5;
        this.activeMeasureTool = null;
        this.isMeasuring = false;
        this.measureStartCell = null;
        this.measureGraphics = null;
        this.measureLabel = null;
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
        /** -----MEASUREMENT OVERLAY----- */
        this.measureGraphics = this.add.graphics();
        this.measureGraphics.setDepth(20);
        this.measureLabel = this.add.text(0, 0, '', {
            fontSize: '13px',
            color: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.55)',
            padding: { x: 6, y: 4 },
        });
        this.measureLabel.setDepth(21);
        this.measureLabel.setVisible(false);
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
            if (pointer.rightButtonDown()) {
                return;
            }
            if (this.isMeasurementToolActive()) {
                this.beginMeasurement(pointer);
                return;
            }
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
            if (this.isMeasuring) {
                this.finishMeasurement();
            }
        });

        this.input.on('pointerupoutside', () => {
            this.isPanning = false;
            this.lastPanPoint = null;
            if (this.isMeasuring) {
                this.finishMeasurement();
            }
        });

        this.input.on('pointermove', (pointer) => {
            if (this.isMeasuring) {
                this.updateMeasurement(pointer);
                return;
            }
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
    isMeasurementToolActive() {
        return this.activeMeasureTool === 'ruler'
            || this.activeMeasureTool === 'compass'
            || this.activeMeasureTool === 'cone';
    }
    setMeasurementTool(tool) {
        if (tool !== 'ruler' && tool !== 'compass' && tool !== 'cone') {
            this.activeMeasureTool = null;
            this.finishMeasurement();
            return;
        }

        this.activeMeasureTool = tool;
        this.finishMeasurement();
    }
    getCellFromWorld(worldX, worldY) {
        if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
            return null;
        }

        const maxX = Math.max(0, this.mapWidth - 1);
        const maxY = Math.max(0, this.mapHeight - 1);
        const clampedX = Phaser.Math.Clamp(worldX, 0, maxX);
        const clampedY = Phaser.Math.Clamp(worldY, 0, maxY);
        const col = Math.floor(clampedX / this.gridSize);
        const row = Math.floor(clampedY / this.gridSize);

        return {
            col,
            row,
            centerX: col * this.gridSize + this.gridSize / 2,
            centerY: row * this.gridSize + this.gridSize / 2,
        };
    }
    getCellFromPointer(pointer) {
        return this.getCellFromWorld(pointer.worldX, pointer.worldY);
    }
    getCellDistance(startCell, endCell) {
        const dx = endCell.col - startCell.col;
        const dy = endCell.row - startCell.row;

        return Math.round(Math.hypot(dx, dy));
    }
    beginMeasurement(pointer) {
        const startCell = this.getCellFromPointer(pointer);
        if (!startCell) {
            return;
        }

        this.deselectToken();
        this.isPanning = false;
        this.lastPanPoint = null;
        this.measureStartCell = startCell;
        this.isMeasuring = true;
        this.updateMeasurement(pointer);
    }
    updateMeasurement(pointer) {
        if (!this.isMeasuring || !this.measureStartCell || !this.isMeasurementToolActive()) {
            return;
        }

        const endCell = this.getCellFromPointer(pointer);
        if (!endCell) {
            return;
        }

        this.clearMeasurementOverlay();

        if (this.activeMeasureTool === 'ruler') {
            this.drawRulerMeasurement(this.measureStartCell, endCell);
            return;
        }

        if (this.activeMeasureTool === 'compass') {
            this.drawCompassMeasurement(this.measureStartCell, endCell);
            return;
        }

        this.drawConeMeasurement(this.measureStartCell, endCell);
    }
    finishMeasurement() {
        this.isMeasuring = false;
        this.measureStartCell = null;
        this.clearMeasurementOverlay();
    }
    clearMeasurementOverlay() {
        if (this.measureGraphics) {
            this.measureGraphics.clear();
        }
        if (this.measureLabel) {
            this.measureLabel.setText('');
            this.measureLabel.setVisible(false);
        }
    }
    drawRulerMeasurement(startCell, endCell) {
        const distanceCells = this.getCellDistance(startCell, endCell);
        const distanceFeet = distanceCells * this.feetPerCell;

        this.measureGraphics.lineStyle(2, 0x3ec8ff, 0.95);
        this.measureGraphics.strokeLineShape(new Phaser.Geom.Line(
            startCell.centerX,
            startCell.centerY,
            endCell.centerX,
            endCell.centerY
        ));
        this.measureGraphics.fillStyle(0x3ec8ff, 0.95);
        this.measureGraphics.fillCircle(startCell.centerX, startCell.centerY, 4);
        this.measureGraphics.fillCircle(endCell.centerX, endCell.centerY, 4);

        this.updateMeasurementLabel(
            endCell.centerX,
            endCell.centerY,
            `Distance: ${distanceFeet} ft (${distanceCells} cells)`
        );
    }
    drawCompassMeasurement(startCell, endCell) {
        const radiusCells = this.getCellDistance(startCell, endCell);
        const radiusFeet = radiusCells * this.feetPerCell;
        const radiusPx = radiusCells * this.gridSize;

        this.measureGraphics.fillStyle(0xf9d45a, 0.14);
        this.measureGraphics.lineStyle(2, 0xf9d45a, 0.95);
        if (radiusPx > 0) {
            this.measureGraphics.fillCircle(startCell.centerX, startCell.centerY, radiusPx);
            this.measureGraphics.strokeCircle(startCell.centerX, startCell.centerY, radiusPx);
        } else {
            this.measureGraphics.fillCircle(startCell.centerX, startCell.centerY, 4);
        }
        this.measureGraphics.lineStyle(1, 0xf9d45a, 0.95);
        this.measureGraphics.strokeLineShape(new Phaser.Geom.Line(
            startCell.centerX,
            startCell.centerY,
            endCell.centerX,
            endCell.centerY
        ));

        this.updateMeasurementLabel(
            endCell.centerX,
            endCell.centerY,
            `Radius: ${radiusFeet} ft (${radiusCells} cells)`
        );
    }
    drawConeMeasurement(startCell, endCell) {
        const lengthCells = this.getCellDistance(startCell, endCell);
        const lengthFeet = lengthCells * this.feetPerCell;

        if (lengthCells <= 0) {
            this.measureGraphics.fillStyle(0xa67bff, 0.95);
            this.measureGraphics.fillCircle(startCell.centerX, startCell.centerY, 4);
            this.updateMeasurementLabel(
                startCell.centerX,
                startCell.centerY,
                'Cone: 0 ft'
            );
            return;
        }

        const lengthPx = lengthCells * this.gridSize;
        const radiusCells = Math.max(1, Math.round(lengthCells / 2));
        const radiusFeet = radiusCells * this.feetPerCell;
        const radiusPx = radiusCells * this.gridSize;
        const angle = Phaser.Math.Angle.Between(
            startCell.centerX,
            startCell.centerY,
            endCell.centerX,
            endCell.centerY
        );
        const endCenterX = startCell.centerX + Math.cos(angle) * lengthPx;
        const endCenterY = startCell.centerY + Math.sin(angle) * lengthPx;
        const perpX = -Math.sin(angle) * radiusPx;
        const perpY = Math.cos(angle) * radiusPx;
        const leftX = endCenterX + perpX;
        const leftY = endCenterY + perpY;
        const rightX = endCenterX - perpX;
        const rightY = endCenterY - perpY;

        this.measureGraphics.fillStyle(0xa67bff, 0.22);
        this.measureGraphics.beginPath();
        this.measureGraphics.moveTo(startCell.centerX, startCell.centerY);
        this.measureGraphics.lineTo(leftX, leftY);
        this.measureGraphics.lineTo(rightX, rightY);
        this.measureGraphics.closePath();
        this.measureGraphics.fillPath();
        this.measureGraphics.lineStyle(2, 0xa67bff, 0.95);
        this.measureGraphics.strokePath();
        this.measureGraphics.lineStyle(1, 0xd7c5ff, 0.95);
        this.measureGraphics.strokeLineShape(new Phaser.Geom.Line(
            startCell.centerX,
            startCell.centerY,
            endCenterX,
            endCenterY
        ));

        this.updateMeasurementLabel(
            endCenterX,
            endCenterY,
            `Cone: L ${lengthFeet} ft (${lengthCells}), R ${radiusFeet} ft (${radiusCells})`
        );
    }
    updateMeasurementLabel(worldX, worldY, text) {
        if (!this.measureLabel) {
            return;
        }

        const zoom = this.cameras.main?.zoom ?? 1;
        const offset = 12 / zoom;
        this.measureLabel.setText(text);
        this.measureLabel.setPosition(worldX + offset, worldY + offset);
        this.measureLabel.setVisible(true);
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

            if (this.isMeasurementToolActive()) {
                return;
            }

            this.selectToken(token);
        });
        // Drag token. Limit token drag by map size
        token.on('drag', (pointer, dragX, dragY) => {
            if (this.isMeasurementToolActive()) {
                return;
            }
            const halfW = sizeX / 2;
            const halfH = sizeY / 2;
            token.x = Phaser.Math.Clamp(dragX, halfW, mapW - halfW);
            token.y = Phaser.Math.Clamp(dragY, halfH, mapH - halfH);
            this.updateTokenAttachments(token);
        });
        // On dragend snap to grid and persist new position via AJAX. Add error handling & CSRF token.
        token.on('dragend', () => {
            if (this.isMeasurementToolActive()) {
                return;
            }
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
    const measureToolHint = $('#measure-tool-hint');
    const domToSceneMeasureTool = {
        'measure-ruler': 'ruler',
        'measure-compass': 'compass',
        'measure-cone': 'cone',
    };

    const setMeasureToolHint = (tool) => {
        if (!measureToolHint.length) {
            return;
        }

        if (tool === 'ruler') {
            measureToolHint.text('Ruler: hold LMB and drag to measure cell-to-cell distance.');
            return;
        }

        if (tool === 'compass') {
            measureToolHint.text('Compass: hold LMB and drag to preview radius from the start cell.');
            return;
        }

        if (tool === 'cone') {
            measureToolHint.text('Cone: hold LMB and drag to preview cone length and radius.');
            return;
        }

        measureToolHint.text('Measurement tool is off.');
    };

    const setMeasureToolButtonsState = (sceneTool) => {
        $('.tool-btn[data-tool="measure-ruler"], .tool-btn[data-tool="measure-compass"], .tool-btn[data-tool="measure-cone"]')
            .removeClass('active');

        const activeDomTool = Object.keys(domToSceneMeasureTool)
            .find((domTool) => domToSceneMeasureTool[domTool] === sceneTool);
        if (activeDomTool) {
            $(`.tool-btn[data-tool="${activeDomTool}"]`).addClass('active');
        }

        setMeasureToolHint(sceneTool ?? null);
    };

    const toggleMeasureTool = (scene, domTool) => {
        const requestedTool = domToSceneMeasureTool[domTool] ?? null;
        if (!requestedTool) {
            return false;
        }

        const nextTool = scene.activeMeasureTool === requestedTool ? null : requestedTool;
        scene.setMeasurementTool(nextTool);
        setMeasureToolButtonsState(nextTool);

        return true;
    };

    setMeasureToolHint(null);

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
            const scene = game.scene.keys.MainScene;
            if (scene) {
                scene.finishMeasurement();
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
        if (toggleMeasureTool(scene, tool)) {
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
