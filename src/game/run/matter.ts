/**
 * Часть Matter.js 0.20, которая нужна забегу. В игре это Phaser.Physics.Matter.Matter
 * (см. phaserMatter.ts), в тестах и у бота — тот же код из node_modules/phaser без браузера.
 *
 * Типы описаны здесь, а не взяты из Phaser: его описание Matter.js отстаёт от самой библиотеки
 * (например, в нём нет engine.gravity и body.parent). Совпадение с настоящей библиотекой
 * проверяют тесты забега: они гоняют этот код на настоящем Matter.js.
 */

export interface MatterVector {
  x: number;
  y: number;
}

export interface MatterBody {
  readonly id: number;
  readonly position: MatterVector;
  readonly velocity: MatterVector;
  readonly angle: number;
  readonly angularVelocity: number;
  readonly inertia: number;
  readonly bounds: { readonly min: MatterVector; readonly max: MatterVector };
  /** Для простых тел — само тело. */
  readonly parent: MatterBody;
  readonly isStatic: boolean;
  /** Трение: меняется и после создания (неподвижному телу Matter сам ставит трение 1). */
  friction: number;
  frictionStatic: number;
}

export interface MatterComposite {
  readonly bodies: readonly MatterBody[];
}

export interface MatterEngine {
  readonly world: MatterComposite;
  readonly gravity: { x: number; y: number; scale: number };
  positionIterations: number;
  velocityIterations: number;
}

export interface MatterPair {
  readonly bodyA: MatterBody;
  readonly bodyB: MatterBody;
}

export interface MatterCollisionEvent {
  readonly pairs: readonly MatterPair[];
}

export interface MatterBodyOptions {
  isStatic?: boolean;
  angle?: number;
  restitution?: number;
  friction?: number;
  frictionStatic?: number;
  frictionAir?: number;
  chamfer?: { radius: number; qualityMin?: number; qualityMax?: number };
}

export interface MatterModule {
  Engine: {
    create(): MatterEngine;
    update(engine: MatterEngine, delta: number): void;
    clear(engine: MatterEngine): void;
  };
  Bodies: {
    rectangle(
      x: number,
      y: number,
      width: number,
      height: number,
      options?: MatterBodyOptions,
    ): MatterBody;
    circle(x: number, y: number, radius: number, options?: MatterBodyOptions): MatterBody;
  };
  Body: {
    setVelocity(body: MatterBody, velocity: MatterVector): void;
    setAngularVelocity(body: MatterBody, velocity: number): void;
    setInertia(body: MatterBody, inertia: number): void;
    /** Сделать тело неподвижным и обратно (масса и инерция восстанавливаются). */
    setStatic(body: MatterBody, isStatic: boolean): void;
  };
  Composite: {
    add(composite: MatterComposite, object: MatterBody | MatterBody[]): void;
    remove(composite: MatterComposite, object: MatterBody): void;
  };
  Events: {
    on(
      object: MatterEngine,
      name: 'collisionStart' | 'collisionActive',
      callback: (event: MatterCollisionEvent) => void,
    ): void;
  };
  Query: {
    point(bodies: MatterBody[], point: MatterVector): MatterBody[];
  };
}
