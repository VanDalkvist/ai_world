import Phaser from "phaser";
import { Client } from "colyseus.js";

const TILE_W = 64;
const TILE_H = 32;
const METRICS_EVENT = "metrics";

type ResourceKind = "energy" | "data" | "alloy";

type Metrics = {
  tick: number;
  map: { width: number; height: number };
  stock: { energy: number; data: number; alloy: number };
  hubs: number;
  agents: number;
  nodes: Record<ResourceKind, number>;
  remaining: Record<ResourceKind, number>;
  priority?: string;
  megaproject?: {
    stageName: string;
    requiredWorkers: number;
    need: Record<ResourceKind, number>;
    progress: Record<ResourceKind, number>;
    workers: number;
  };
  policy?: {
    megQuotaRatio: number;
  };
};

class IsoScene extends Phaser.Scene {
  private client!: Client;
  private room: any;

  private tiles: Phaser.GameObjects.Rectangle[] = [];
  private resourceSprites = new Map<string, Phaser.GameObjects.Ellipse>();
  private agentSprites = new Map<string, Phaser.GameObjects.Rectangle>();
  private buildingSprites: Phaser.GameObjects.Rectangle[] = [];
  private megaprojectSprite?: Phaser.GameObjects.Rectangle;
  private mapWidth = 0;
  private mapHeight = 0;
  private mapOffset = new Phaser.Math.Vector2();
  private isDragging = false;
  private dragPointer = new Phaser.Math.Vector2();
  private dragCameraStart = new Phaser.Math.Vector2();

  constructor() {
    super("IsoScene");
  }

  preload() {
    //
  }

  async create() {
    this.cameras.main.setBackgroundColor("#0a0e14");
    this.setupCameraControls();

    if (!this.scene.isActive("HudScene")) {
      this.scene.launch("HudScene");
    }
    this.scene.bringToTop("HudScene");

    this.client = new Client("ws://localhost:2567");
    this.room = await this.client.joinOrCreate("my_room");

    this.room.onStateChange((state: any) => {
      this.ensureTiles(state);
      this.renderState(state);
      this.emitMetrics(state);
    });
  }

  private renderState(state: any) {
    state.resources.forEach((resource: any, id: string) => {
      const { px, py } = this.isoToScreen(resource.x, resource.y);
      let sprite = this.resourceSprites.get(id);

      if (!sprite) {
        const color =
          resource.kind === "energy"
            ? 0x00ffff
            : resource.kind === "data"
              ? 0xff00ff
              : 0xffcc00;
        sprite = this.add.ellipse(px, py - 6, 12, 12, color).setOrigin(0.5);
        this.resourceSprites.set(id, sprite);
      }
      sprite.setPosition(px, py - 6);
      sprite.setScale(0.5 + resource.amount / 20);
    });

    for (const [id, sprite] of this.resourceSprites) {
      if (!state.resources.has(id)) {
        sprite.destroy();
        this.resourceSprites.delete(id);
      }
    }

    state.agents.forEach((agent: any) => {
      const { px, py } = this.isoToScreen(agent.x, agent.y);
      let sprite = this.agentSprites.get(agent.id);
      if (!sprite) {
        sprite = this.add.rectangle(px, py - 12, 10, 16, 0xffffff).setOrigin(0.5);
        this.agentSprites.set(agent.id, sprite);
      }
      sprite.setPosition(px, py - 12);
      sprite.setFillStyle(agent.status === "building" ? 0x66ff66 : 0xffffff);
    });

    // remove stale agent sprites
    for (const [id, sprite] of this.agentSprites) {
      if (!state.agents.find((a: any) => a.id === id)) {
        sprite.destroy();
        this.agentSprites.delete(id);
      }
    }

    state.buildings.forEach((building: any, idx: number) => {
      const { px, py } = this.isoToScreen(building.x, building.y);
      if (!this.buildingSprites[idx]) {
        const sprite = this.add.rectangle(px, py - 18, 18, 18, 0x66ff66).setOrigin(0.5);
        this.buildingSprites[idx] = sprite;
      } else {
        this.buildingSprites[idx].setPosition(px, py - 18);
      }
    });

    this.renderMegaproject(state);
  }

  private renderMegaproject(state: any) {
    const mp = state.megaproject;
    if (!mp || !mp.stageName) {
      if (this.megaprojectSprite) {
        this.megaprojectSprite.destroy();
        this.megaprojectSprite = undefined;
      }
      return;
    }
    const { px, py } = this.isoToScreen(mp.siteX, mp.siteY);
    const totalNeed = mp.need.energy + mp.need.data + mp.need.alloy;
    const totalProgress = mp.progress.energy + mp.progress.data + mp.progress.alloy;
    const ratio = totalNeed > 0 ? Phaser.Math.Clamp(totalProgress / totalNeed, 0, 1) : 0;
    const size = 24 + ratio * 24;
    const color = Phaser.Display.Color.GetColor(
      255,
      Math.floor(80 + 120 * ratio),
      170 + Math.floor(40 * ratio),
    );

    if (!this.megaprojectSprite) {
      this.megaprojectSprite = this.add
        .rectangle(px, py - 12, size, size, color, 0.8)
        .setOrigin(0.5)
        .setAngle(45)
        .setStrokeStyle(2, 0xffffff);
    } else {
      this.megaprojectSprite
        .setPosition(px, py - 12)
        .setSize(size, size)
        .setFillStyle(color, 0.85);
    }
  }

  private emitMetrics(state: any) {
    const nodes: Record<ResourceKind, number> = { energy: 0, data: 0, alloy: 0 };
    const remaining: Record<ResourceKind, number> = { energy: 0, data: 0, alloy: 0 };
    state.resources.forEach((resource: any) => {
      nodes[resource.kind as ResourceKind] += 1;
      remaining[resource.kind as ResourceKind] += resource.amount;
    });

    const megWorkers = state.agents?.filter((agent: any) => agent.taskKind === "megabuild")
      ?.length ?? 0;
    const metrics: Metrics = {
      tick: state.tick ?? 0,
      map: { width: state.width ?? this.mapWidth, height: state.height ?? this.mapHeight },
      stock: {
        energy: state.stock?.energy ?? 0,
        data: state.stock?.data ?? 0,
        alloy: state.stock?.alloy ?? 0,
      },
      hubs: state.buildings?.length ?? 0,
      agents: state.agents?.length ?? 0,
      nodes,
      remaining,
      priority: state.latestPlanPriority ?? undefined,
      megaproject: state.megaproject
        ? {
            stageName: state.megaproject.stageName,
            requiredWorkers: state.megaproject.requiredWorkers,
            need: {
              energy: state.megaproject.need.energy,
              data: state.megaproject.need.data,
              alloy: state.megaproject.need.alloy,
            },
            progress: {
              energy: state.megaproject.progress.energy,
              data: state.megaproject.progress.data,
              alloy: state.megaproject.progress.alloy,
            },
            workers: megWorkers,
          }
        : undefined,
      policy: state.policy
        ? {
            megQuotaRatio: state.policy.megQuotaRatio,
          }
        : undefined,
    };

    this.game.events.emit(METRICS_EVENT, metrics);
  }

  private ensureTiles(state: any) {
    if (!state.width || !state.height) return;
    if (state.width === this.mapWidth && state.height === this.mapHeight) {
      return;
    }
    this.tiles.forEach((tile) => tile.destroy());
    this.tiles = [];
    this.mapWidth = state.width;
    this.mapHeight = state.height;
    this.recalculateMapOffset();

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const { px, py } = this.isoToScreen(x, y);
        const tile = this.add.rectangle(px, py, TILE_W, TILE_H, 0x1a1f2b).setOrigin(0.5);
        tile.setAngle(45);
        this.tiles.push(tile);
      }
    }
  }

  private isoToScreen(x: number, y: number) {
    const px = (x - y) * (TILE_W / 2) + this.mapOffset.x;
    const py = (x + y) * (TILE_H / 2) + this.mapOffset.y;
    return { px, py };
  }

  private recalculateMapOffset() {
    const mapCenterX = (this.mapWidth - 1) / 2;
    const mapCenterY = (this.mapHeight - 1) / 2;
    const centerPx = (mapCenterX - mapCenterY) * (TILE_W / 2);
    const centerPy = (mapCenterX + mapCenterY) * (TILE_H / 2);
    this.mapOffset.x = this.scale.width / 2 - centerPx;
    this.mapOffset.y = this.scale.height / 2 - centerPy - 40;
  }

  private setupCameraControls() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.isDragging = true;
      this.dragPointer.set(pointer.x, pointer.y);
      this.dragCameraStart.set(this.cameras.main.scrollX, this.cameras.main.scrollY);
    });

    const stopDrag = () => {
      this.isDragging = false;
    };

    this.input.on("pointerup", stopDrag);
    this.input.on("pointerupoutside", stopDrag);

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging) return;
      const dx = pointer.x - this.dragPointer.x;
      const dy = pointer.y - this.dragPointer.y;
      this.cameras.main.scrollX = this.dragCameraStart.x - dx;
      this.cameras.main.scrollY = this.dragCameraStart.y - dy;
    });

    this.input.on("wheel", (_pointer: any, _gameObjects: any, _dx: number, dy: number) => {
      const zoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.4, 2);
      this.cameras.main.setZoom(zoom);
    });
  }
}

class HudScene extends Phaser.Scene {
  private topText!: Phaser.GameObjects.Text;
  private detailsText!: Phaser.GameObjects.Text;
  private detailsContainer!: Phaser.GameObjects.Container;
  private toggleButton!: Phaser.GameObjects.Text;
  private detailsVisible = false;
  private metricsHandler = (metrics: Metrics) => this.updateMetrics(metrics);

  constructor() {
    super("HudScene");
  }

  create() {
    const padding = 12;
    const topBg = this.add
      .rectangle(padding, padding, 360, 70, 0x000000, 0.55)
      .setOrigin(0)
      .setStrokeStyle(1, 0x30f2ff, 0.6);

    this.topText = this.add
      .text(padding + 8, padding + 8, "Tick 0 | ⚡ -- ✦ -- ⛓ -- | Hubs 0 | Agents 0", {
        fontSize: "14px",
        fontFamily: "JetBrains Mono, monospace",
        color: "#e5f4ff",
      })
      .setOrigin(0, 0);

    this.toggleButton = this.add
      .text(padding + 8, padding + 38, "Details ▸", {
        fontSize: "12px",
        fontFamily: "JetBrains Mono, monospace",
        color: "#8be8ff",
      })
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => this.toggleDetails());

    this.detailsContainer = this.add.container(padding, padding + topBg.height + 8).setVisible(false);
    const detailsBg = this.add
      .rectangle(0, 0, 360, 160, 0x000000, 0.55)
      .setOrigin(0)
      .setStrokeStyle(1, 0x30f2ff, 0.4);
    this.detailsText = this.add
      .text(8, 8, this.formatDetails(null), {
        fontSize: "12px",
        fontFamily: "JetBrains Mono, monospace",
        color: "#d1f8ff",
      })
      .setOrigin(0, 0);
    this.detailsContainer.add([detailsBg, this.detailsText]);

    this.game.events.on(METRICS_EVENT, this.metricsHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(METRICS_EVENT, this.metricsHandler);
    });
  }

  private toggleDetails() {
    this.detailsVisible = !this.detailsVisible;
    this.detailsContainer.setVisible(this.detailsVisible);
    this.toggleButton.setText(this.detailsVisible ? "Details ▾" : "Details ▸");
  }

  private updateMetrics(metrics: Metrics) {
    const topLine = `Tick ${metrics.tick} | ⚡ ${metrics.stock.energy} ✦ ${metrics.stock.data} ⛓ ${metrics.stock.alloy} | Hubs ${metrics.hubs} | Agents ${metrics.agents}`;
    this.topText.setText(topLine);
    this.detailsText.setText(this.formatDetails(metrics));
  }

  private formatDetails(metrics: Metrics | null) {
    if (!metrics) {
      return "Awaiting telemetry…";
    }
    const resLine = (kind: ResourceKind, label: string) =>
      `${label}: ${metrics.nodes[kind]} nodes / ${metrics.remaining[kind]} left`;
    const lines = [
      `Map: ${metrics.map.width} × ${metrics.map.height}`,
      resLine("energy", "Energy"),
      resLine("data", "Data"),
      resLine("alloy", "Alloy"),
      `Stock: ⚡ ${metrics.stock.energy} · ✦ ${metrics.stock.data} · ⛓ ${metrics.stock.alloy}`,
      `Priority: ${metrics.priority ?? "—"}`,
    ];
    if (metrics.megaproject) {
      const mp = metrics.megaproject;
      const quota = metrics.policy ? `${Math.round(metrics.policy.megQuotaRatio * 100)}%` : "—";
      lines.push(
        "",
        `Megaproject: ${mp.stageName}`,
        `Progress: ⚡ ${mp.progress.energy}/${mp.need.energy} · ✦ ${mp.progress.data}/${mp.need.data} · ⛓ ${mp.progress.alloy}/${mp.need.alloy}`,
        `Workers: ${mp.workers}/${mp.requiredWorkers} | Quota ${quota}`,
      );
    }
    return lines.join("\n");
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: "app",
  backgroundColor: "#0a0e14",
  scene: [IsoScene, HudScene],
});
