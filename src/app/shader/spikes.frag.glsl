#version 300 es

precision highp float;

uniform sampler2D u_particlePosTexture;
uniform sampler2D u_heightMapTexture;

out vec4 outColor;

in vec3 v_position;
in vec2 v_texcoord;
in vec3 v_normal;


void main() {
    vec3 N = v_normal;
    vec3 L = normalize(vec3(0., 1., -10.));
    float dif = dot(L, N);

    outColor = vec4(dif) * 0.8 + 0.2;
}