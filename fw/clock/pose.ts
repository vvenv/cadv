/*
	In-plane gravity says which edge of the card is down.
	Flat on a desk (little X/Y) returns null so the face stays put.
	The level firmware treats +Y as the far edge, so the keyboard is -Y.
	When +Y points down the keyboard is up and the face rotates 180.
*/

export function poseRotation(x: number, y: number, z: number): 0 | 180 | null {
	void z;
	const plane = x * x + y * y;
	if (plane < 0.04)
		return null;
	if (Math.abs(y) < Math.abs(x))
		return null;
	return y < -0.25 ? 180 : 0;
}
