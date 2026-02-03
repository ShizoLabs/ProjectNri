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

        this.cameras.main.startFollow(token, true, 0.08, 0.08);
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

        fetch(`/token/${tokenId}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x: startX, y: startY, mapId })
        }).then(() => {
            const token = scene.addToken(startX, startY, 25, 0x0000ff);
            token.tokenId = tokenId;
            token.tokenName = tokenName;
            token.mapId = mapId;

            row.find('.token-place-btn').remove();
            row.append('<span>On map</span>');
        });
    });

    $('.tab-btn').click(function() {
        const tabId = $(this).data('tab');

        $('.tab-btn').removeClass('active');
        $(this).addClass('active');

        $('.tab').hide();

        $('#' + tabId).show();
    });
});
