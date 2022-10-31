
#version 300 es

precision highp float;

uniform sampler2D u_forceTexture;
uniform sampler2D u_positionTexture;
uniform sampler2D u_velocityTexture;
uniform sampler2D u_densityPressureTexture;
uniform float u_dt;
uniform float u_frames;
uniform vec2 u_domainScale;
uniform float u_zoom;

layout(std140) uniform u_PointerParams {
    vec2 pointerPos;
    vec2 pointerVelocity;
    float pointerRadius;
    float pointerStrength;
};

in vec2 v_uv;

layout(location = 0) out vec4 outPosition;
layout(location = 1) out vec4 outVelocity;

 float rand(vec2 n) { 
	return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float noise(vec2 p){
	vec2 ip = floor(p);
	vec2 u = fract(p);
	u = u*u*(3.0-2.0*u);
	
	float res = mix(
		mix(rand(ip),rand(ip+vec2(1.0,0.0)),u.x),
		mix(rand(ip+vec2(0.0,1.0)),rand(ip+vec2(1.0,1.0)),u.x),u.y);
	return res*res;
}

void main() {
    ivec2 particleTexDimensions = textureSize(u_positionTexture, 0);
    vec4 domainScale = vec4(u_domainScale, 0., 0.);

    vec4 pi = texture(u_positionTexture, v_uv);
    vec4 vi = texture(u_velocityTexture, v_uv);
    vec4 fi = texture(u_forceTexture, v_uv);
    vec4 ri = texture(u_densityPressureTexture, v_uv);

    // integrate to update the velocity
    float dt = (u_dt * 0.001);
    float rho = ri.x + 0.000000001;
    vec4 ai = fi / rho;
    vi += ai * dt;

    // apply the pointer force
    vec4 pointerPos = vec4(pointerPos, 0., 0.);
    float pr = length(pointerPos.xy * domainScale.xy - pi.xy * domainScale.xy);
    if (pr < pointerRadius) {
        vi.xy += pointerVelocity * pointerStrength * (1. - pr / pointerRadius);
    }

    // apply idle force
    vec2 idleForcePos = vec2(0., -0.1);
    float ir = length(idleForcePos - pi.xy);
    if (ir < 0.25) {
        vi.xy += vec2(0.005 * cos(u_frames * 0.01), 0.);
    }

    // update the position
    pi += (vi + 0.5 * ai * dt) * dt;

    // apply nervous wiggle
    float zoomForce = noise(pi.xy * 1000. + 500.);
    pi.xy += zoomForce * 0.008 * max(0., (1. - u_zoom * 2.5));

    outPosition = pi;
    outVelocity = vi;

    // damp the movement on the edges
    float dim = .9; // damping distance
    float damping = 1. - max(0., length(pi) - dim);
    outVelocity *= damping;
}