export declare const PARTS: { id: string; n: number }[];
export declare const LOOK_LENGTH: number;
export declare function cleanLook(input: unknown): string;
export declare function decode(look: string): Record<string, number> | null;
export declare function encode(parts: Record<string, number>): string;
export declare function randomLook(rand?: () => number): string;
export declare function rollPart(look: string, id: string, rand?: () => number): string;
export declare function stepPart(look: string, id: string, dir: number): string;
