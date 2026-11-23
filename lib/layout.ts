/**
 * Where each shelf's top edge rests when it takes focus, as a fraction of the viewport height.
 * Shared with the hero, which reserves the same band below its copy, so no hero text ever sits
 * where the next shelf will land.
 */
export const SHELF_ANCHOR = { continue: 0.22, taste: 0.11, apps: 0.45 } as const
