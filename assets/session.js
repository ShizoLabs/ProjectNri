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
        // Token select
        token.on('pointerdown', () => {
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
            fetch(`/token/${token.tokenId}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ x: token.x, y: token.y, mapId: token.mapId })
            });
        });
        // Expose token.meta: tokenId, tokenName, mapId for later server calls
        this.tokensGroup.add(token);

        token.tokenId = data.id;
        token.tokenName = data.name ?? '';
        token.mapId = window.SESSION_MAP?.id ?? data.mapId ?? null;

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

// Switch tabs
$(document).ready(function() {
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

        fetch(`/token/${tokenId}/spawn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x: startX, y: startY, mapId })
        }).then((res) => res.json()).then((data) => {
            if (!data || !data.id) {
                return;
            }
            scene.addToken({
                ...data,
                x: startX,
                y: startY,
                mapId,
            });
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
                fetch(`/token/${token.tokenId}/remove`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                }).then(() => {
                    if (token.tokenLabel) {
                        token.tokenLabel.destroy();
                    }
                    if (token.selectionOutline) {
                        token.selectionOutline.destroy();
                    }
                    token.destroy();
                    scene.selectedToken = null;
                    scene.cameras.main.stopFollow();
                });
                break;
            }
            default:
                break;
        }
    });
});
