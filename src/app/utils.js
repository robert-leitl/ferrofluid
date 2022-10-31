export const mapRange = (value, min1, max1, min2, max2) => {
    return min2 + (max2 - min2) * (value - min1) / (max1 - min1);
}

export const clamp = (num, min, max) => Math.min(Math.max(num, min), max);