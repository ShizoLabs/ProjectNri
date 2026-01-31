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
    }

    create() {
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
        this.addToken(
            Math.floor(mapWidth / 2 / gridSize) * gridSize + gridSize / 2, // X
            Math.floor(mapHeight / 2 / gridSize) * gridSize + gridSize / 2, // Y
            25, 
            0x0000ff
        );
        /** -----CAMERA----- */
        // Set cameras view
        this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
    }

    addToken(x, y, radius, color) {
        const gs = this.gridSize;
        const mapW = this.mapWidth;
        const mapH = this.mapHeight;

        const token = this.add.circle(x, y, radius, color)
            .setInteractive({ draggable: true });
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
        });

        this.cameras.main.startFollow(token, true, 0.08, 0.08);
        this.tokensGroup.add(token);

        return token;
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
    $('.tab-btn').click(function() {
        const tabId = $(this).data('tab');

        $('.tab-btn').removeClass('active');
        $(this).addClass('active');

        $('.tab').hide();

        $('#' + tabId).show();
    });
});