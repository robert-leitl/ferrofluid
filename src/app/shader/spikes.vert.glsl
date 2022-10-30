#version 300 es

precision highp float;

uniform mat4 u_worldMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform sampler2D u_heightMapTexture;
uniform float u_zoom;

in vec3 position;
in vec2 texcoord;

out vec3 v_position;
out vec2 v_texcoord;
out vec3 v_normal;

#include ./utils/particle-utils.glsl;

vec3 distort(vec3 p) {
    // get the height info
    vec2 uv = p.xz * 0.5 + 0.5;
    float res = texture(u_heightMapTexture, uv).r;

    // weight by zoom
    float zoomFactor = 1. + (1.9 - u_zoom) * 0.6;
    res *= zoomFactor;

    // smooth out edges
    zoomFactor = 1. + (1.9 - u_zoom) * 0.2;
    float edge = smoothstep(0.5, max(0.8, .8 * zoomFactor), 1. - length(p));
    res *= edge;

    // spherical part
    vec3 sp = normalize(p - vec3(0., -.4, 0.)) * res;
    vec3 r = p + sp;

    return r;
}

void main() {
    vec2 heightMapSize = vec2(textureSize(u_heightMapTexture, 0));
    vec2 heightMapTexelSize = 1./heightMapSize;
    vec3 p = distort(position);
    
    // normal estimation
    float epsilon = heightMapTexelSize.x * 1.1;
    vec3 t = distort(position + vec3(epsilon, 0., 0.));
    vec3 b = distort(position + vec3(0., 0., epsilon));
    v_normal = normalize(cross(p - t, b - p));

    v_texcoord = texcoord;
    v_position = position;
    gl_Position = u_projectionMatrix * u_viewMatrix * u_worldMatrix * vec4(p, 1.);
}