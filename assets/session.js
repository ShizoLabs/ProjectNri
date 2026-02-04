// Scene to load some resources (currently not in use)
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
    // ID
    constructor() {
        super({ key: 'MainScene' });
        this.mapWidth = 2000;
        this.mapHeight = 2000;
        this.gridSize = 50;
        this.selectedToken = null;
    }

    create() {
        if (window.SESSION_MAP) {
            this.mapWidth = window.SESSION_MAP.width ?? this.mapWidth;
            this.mapHeight = window.SESSION_MAP.height ?? this.mapHeight;
        }
        /** -----MAP----- */
        // Map size in px
        const mapWidth = this.mapWidth;
        const mapHeight = this.mapHeight;
        // Map
        this.map = this.add.rectangle(
            mapWidth / 2,
            mapHeight / 2,
            mapWidth,
            mapHeight,
            0xffffff
        );
        // Map as background
        this.map.setDepth(-1);
        /** -----GRID----- */
        // Cell size in px
        const gridSize = this.gridSize;
        // Graphics for map cells
        const grid = this.add.graphics();
        grid.lineStyle(1, 0x888888, 0.5); // Line style
        // Vertical lines
        for (let x = 0; x <= mapWidth; x += gridSize) {
            grid.moveTo(x, 0);
            grid.lineTo(x, mapHeight);
        }
        // Horizonal lines
        for (let y = 0; y <= mapHeight; y += gridSize) {
            grid.moveTo(0, y);
            grid.lineTo(mapWidth, y);
        }
        // Apply lines to map
        grid.strokePath();
        // Grid as neutral layer
        grid.setDepth(0);
        this.gridLayer = grid;
        this.gridVisible = true;
        /** -----TOKENS----- */
        // Group for all tokens
        this.tokensGroup = this.add.group();
        // Add new token
        if (window.SESSION_TOKENS) {
            window.SESSION_TOKENS.forEach(data => {
                const token = this.addToken(
                    data.x,
                    data.y,
                    25,
                    data.color ?? 0x0000ff
                );
                // Connect token with DB
                token.tokenId = data.id;
                token.tokenName = data.name;
                token.mapId = window.SESSION_MAP?.id ?? null;
            });
        }
        /** -----CAMERA----- */
        // Set cameras view
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

    addToken(x, y, radius, color) {
        const gs = this.gridSize;
        const mapW = this.mapWidth;
        const mapH = this.mapHeight;

        const token = this.add.circle(x, y, radius, color).setInteractive({ draggable: true });
        // Выбор токена при клике
        token.on('pointerdown', () => {
            this.selectToken(token);
        });
        // Drag: ограничиваем по реальной карте
        token.on('drag', (pointer, dragX, dragY) => {
            token.x = Phaser.Math.Clamp(dragX, radius, mapW - radius);
            token.y = Phaser.Math.Clamp(dragY, radius, mapH - radius);
        });
        // Snap к центру ближайшей клетки при окончании drag
        token.on('dragend', () => {
            const snappedX = Math.round((token.x - gs / 2) / gs) * gs + gs / 2;
            const snappedY = Math.round((token.y - gs / 2) / gs) * gs + gs / 2;
            // Присваиваем только если реально изменилось (избегаем лишних перерисовок)
            if (Math.abs(snappedX - token.x) > 0.0001) token.x = snappedX;
            if (Math.abs(snappedY - token.y) > 0.0001) token.y = snappedY;
            // Отправляем на сервер
            fetch(`/token/${token.tokenId}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ x: token.x, y: token.y, mapId: token.mapId })
            });
        });

        this.tokensGroup.add(token);

        return token;
    }

    selectToken(token) {
        // Если выбран - то перевыбрать
        if (this.selectedToken) {
            this.selectedToken.setStrokeStyle();
        }

        this.selectedToken = token;

        // Визуальное выделение
        token.setStrokeStyle(3, 0xffff00);

        this.cameras.main.startFollow(token, true, 0.08, 0.08);
    }

    deselectToken() {
        if (this.selectedToken) {
            this.selectedToken.setStrokeStyle();
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

// Start the game
const game = new Phaser.Game(config);

// Switch tabs
$(document).ready(function() {
    // Toggle maps list
    $('#map-list-toggle').click(function() {
        $('#map-list-panel').toggleClass('is-open');
    });

    // Switch map
    $(document).on('click', '.map-switch-btn', function() {
        const mapId = $(this).data('map-id');
        if (!mapId) {
            return;
        }
        const baseUrl = window.SESSION_OPEN_URL || `/session/${window.SESSION_ID}`;
        window.location.href = `${baseUrl}?map=${mapId}`;
    });

    // Place token on the map
    $('.token-place-btn').click(function() {
        const row = $(this).closest('.token-row');
        const tokenId = row.data('token-id');
        const tokenName = row.data('token-name');
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
            const token = scene.addToken(startX, startY, 25, 0x0000ff);
            token.tokenId = data.id;
            token.tokenName = tokenName;
            token.mapId = mapId;
        });
    });

    $('.tab-btn').click(function() {
        const tabId = $(this).data('tab');

        $('.tab-btn').removeClass('active');
        $(this).addClass('active');

        $('.tab').hide();

        $('#' + tabId).show();
    });

    // Map tools
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
