precision mediump float;

/**
------------ one pass bloom shader ------------

    author: Richman Stewart

    applies a gaussian blur horizontally and vertically
    and applies it on top of the original texture

------------------ use ------------------------

    bloom_size - defines the spread x and y
    bloom_intensity - bloom intensity

**/

varying vec2 v_texCoord;

uniform sampler2D u_texture0;
const float bloom_spread = 1.0;
const float bloom_intensity = 2.0;

vec2 approximateTextureSize(sampler2D tex) {
    float epsilon = 1.0 / 256.0;
    vec2 texSize;

    vec4 colorTL = texture2D(tex, vec2(epsilon, epsilon));
    vec4 colorBR = texture2D(tex, vec2(1.0 - epsilon, 1.0 - epsilon));

    texSize.x = (1.0 - 2.0 * epsilon) / abs(colorBR.x - colorTL.x);
    texSize.y = (1.0 - 2.0 * epsilon) / abs(colorBR.y - colorTL.y);

    return texSize;
}

void main() {
    // vec2 size = approximateTextureSize(u_texture0);
    vec2 size = vec2(480, 360);

    float uv_x = v_texCoord.x * size.x;
    float uv_y = v_texCoord.y * size.y;

    vec4 sum = vec4(0.0);
    for(int n = 0; n < 9; ++n) {
        uv_y = (v_texCoord.y * size.y) + (bloom_spread * float(n - 4));
        vec4 h_sum = vec4(0.0);
        h_sum += texture2D(u_texture0, vec2(uv_x - (4.0 * bloom_spread), uv_y));
        h_sum += texture2D(u_texture0, vec2(uv_x - (3.0 * bloom_spread), uv_y));
        h_sum += texture2D(u_texture0, vec2(uv_x - (2.0 * bloom_spread), uv_y));
        h_sum += texture2D(u_texture0, vec2(uv_x - bloom_spread, uv_y));
        h_sum += texture2D(u_texture0, vec2(uv_x, uv_y));
        h_sum += texture2D(u_texture0, vec2(uv_x + bloom_spread, uv_y));
        h_sum += texture2D(u_texture0, vec2(uv_x + (2.0 * bloom_spread), uv_y));
        h_sum += texture2D(u_texture0, vec2(uv_x + (3.0 * bloom_spread), uv_y));
        h_sum += texture2D(u_texture0, vec2(uv_x + (4.0 * bloom_spread), uv_y));
        sum += h_sum / 9.0;
    }

    // gl_FragColor = texture2D(u_texture0, v_texCoord) - ((sum / 9.0) * bloom_intensity);
    gl_FragColor.b *= 8.0;
}