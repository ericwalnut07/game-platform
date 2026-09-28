/** v0.6 asset structure. A '?' is NOT a floor: unimplemented device physics must block runtime. */
export type Face = 'front' | 'back';
export interface Point { readonly x: number; readonly y: number }
export interface MarkerClaim { readonly objectId: string; readonly role: string }
export interface DeviceMarker {
  readonly markerId: string;
  readonly side: Face;
  readonly cell: Point;
  readonly sourceGlyph: string;
  readonly classification: 'static-hole' | 'device';
  readonly claims: readonly MarkerClaim[];
}
export interface DeviceRecord {
  readonly id: string;
  readonly kind: string;
  readonly config: Readonly<Record<string, unknown>>;
}
export interface LayeredStageAsset {
  readonly schemaVersion: 'layered-stage-0.6';
  readonly stageId: string;
  readonly category: 'tutorial' | 'challenge';
  readonly width: number;
  readonly height: number;
  readonly supportedPlayModes: readonly ('ONLINE_DUO' | 'SOLO_PRACTICE')[];
  readonly start: Readonly<Record<Face, Point>>;
  readonly goal: Readonly<Record<Face, Point>>;
  readonly terrain: Readonly<Record<Face, readonly string[]>>;
  readonly sourceGlyphs: Readonly<Record<Face, readonly string[]>>;
  readonly deviceMarkers: readonly DeviceMarker[];
  readonly devices: readonly DeviceRecord[];
  readonly readyForWebRuntime: false;
  readonly playableByPrototypeCore: boolean;
}
