#version 300 es

precision highp float;

uniform mat4 u_worldMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform sampler2D u_heightMapTexture;

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

    // smooth out edges
    float edge = smoothstep(0.5, .8, 1. - length(p));
    res *= edge;

    // spherical part
    vec3 sp = normalize(p - vec3(0., -.4, 0.)) * res;
    vec3 r = p + sp;

    return r;
}

void main() {
    vec3 pos = position;
    vec3 p = distort(position);
    
    // normal estimation
    float epsilon = 0.0001;
    vec3 t = distort(position + vec3(epsilon, 0., 0.));
    vec3 b = distort(position + vec3(0., 0., epsilon));
    v_normal = normalize(cross(t - p, b - p));

    v_texcoord = texcoord;
    v_position = position;
    gl_Position = u_projectionMatrix * u_viewMatrix * u_worldMatrix * vec4(p, 1.);
}