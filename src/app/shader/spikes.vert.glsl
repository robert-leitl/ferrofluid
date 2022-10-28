#version 300 es

precision highp float;
precision highp int;
precision highp usampler2D;

uniform ivec2 u_cellTexSize;
uniform float u_cellSize;
uniform float u_zoom;
uniform vec2 u_domainScale;
uniform mat4 u_worldMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform sampler2D u_particlePosTexture;
uniform usampler2D u_indicesTexture;
uniform usampler2D u_offsetTexture;

in vec3 position;
in vec2 texcoord;

out vec3 v_position;
out vec2 v_texcoord;
out vec3 v_normal;

#include ./utils/particle-utils.glsl;

// https://iquilezles.org/articles/functions/
float almostIdentity( float x, float m, float n )
{
    if( x>m ) return x;
    float a = 2.0*n - m;
    float b = 2.0*m - 3.0*n;
    float t = x/m;
    return (a*t + b)*t*t + n;
}

// smooth voronoi (https://www.shadertoy.com/view/ldB3zc)
vec3 distort(vec3 p, ivec2 particleTexDimensions, int count, bool useCells) {
    float w = .06; // smoothing factor (the higher, the smoother)
    float res = 1.; // result height value
    int emptyOffsetValue = count * count;
    int cellCount = u_cellTexSize.x * u_cellTexSize.y;

    if (useCells) {
        // find the cell id of this particle
        ivec2 cellIndex = pos2CellIndex(p.xy, u_cellTexSize, u_domainScale.xy, u_cellSize);

        for(int i = -1; i <= 1; ++i)
        {
            for(int j = -1; j <= 1; ++j)
            {
                ivec2 neighborIndex = cellIndex + ivec2(i, j);
                int neighborId = tex2ndx(u_cellTexSize, neighborIndex) % cellCount;
                
                // look up the offset to the cell:
                int neighborIterator = int(texelFetch(u_offsetTexture, ndx2tex(u_cellTexSize, neighborId), 0).x);

                // iterate through particles in the neighbour cell (if iterator offset is valid)
                while(neighborIterator != emptyOffsetValue && neighborIterator < count)
                {
                    uvec2 indexData = texelFetch(u_indicesTexture, ndx2tex(particleTexDimensions, neighborIterator), 0).xy;

                    if(int(indexData.x) != neighborId) {
                        break;  // it means we stepped out of the neighbour cell list
                    }

                    // find min distance and calculate res height
                    uint pi_ndx = indexData.y;
                    vec2 pi = texelFetch(u_particlePosTexture, ndx2tex(particleTexDimensions, int(pi_ndx)), 0).xy * u_zoom;
                    float d = distance( pi, p.xz );

                    // do the smooth min for colors and distances
                    float h = smoothstep( -1., 1., (res - d) / w );
                    res = mix(res, d, h) - h * (1.0-h) * (w / (1.0 + 3.0 * w));

                    neighborIterator++;
                }
            }
        }
    } else {
        for(int i=0; i<count; i++) {
            vec2 pi = texelFetch(u_particlePosTexture, ndx2tex(particleTexDimensions, i), 0).xy;
            vec2 r = pi - p.xz;
            float d = distance( pi, p.xz );

            // do the smooth min for colors and distances		
            float h = smoothstep( -1., 1., (res-d)/w );
            res = mix( res, d, h ) - h*(1.0-h)*w/(1.0+3.0*w);
        }
    }
    

    // gain according to particle density
    float defaultZoom = 1.9;
    float zoomGain = 1. + (defaultZoom - u_zoom) * 2.;
    float gain = 10. * zoomGain;
    res = clamp(res * gain, 0., 1.);

    // smooth out the spike peaks
    res = almostIdentity(res, 0.15, 0.05);

    
    res = (1. - res);
    res *= 0.25; // max height

    // smooth out edges
    float edge = smoothstep(0.5, .8, 1. - length(p));
    res *= edge;

    // spherical part
    vec3 sp = normalize(p - vec3(0., -.4, 0.)) * res;
    vec3 r = p + sp;

    return r;
}

void main() {
    ivec2 texSize = textureSize(u_particlePosTexture, 0);
    int particleCount = texSize.x * texSize.y;

    vec3 pos = position;
    vec3 p = distort(pos, texSize, particleCount, true);
    
    // temp normal extimation
    float epsilon = 0.00001;
    vec3 t = distort(pos + vec3(epsilon, 0., 0.), texSize, particleCount, true);
    vec3 b = distort(pos + vec3(0., 0., epsilon), texSize, particleCount, true);
    v_normal = normalize(cross(t - p, b - p));

    v_texcoord = texcoord;
    v_position = position;
    gl_Position = u_projectionMatrix * u_viewMatrix * u_worldMatrix * vec4(p, 1.);
}