export const pickTangramFeatureAtClick = async ({
  mapTiles,
  tangramLayer,
  event,
  timeoutMs = 2000,
}) => {
  if (mapTiles !== "LEAFLET") return null;

  const scene = tangramLayer?.scene;
  const containerPoint = event?.containerPoint;
  if (!scene || !containerPoint || typeof scene.getFeatureAt !== "function") {
    return null;
  }

  const pixel = { x: containerPoint.x, y: containerPoint.y };

  try {
    const pickTimeout = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Tangram pick timed out after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    );

    const picked = await Promise.race([scene.getFeatureAt(pixel), pickTimeout]);
    console.log("Tangram picked feature:", picked);
    return picked;
  } catch (error) {
    console.error("Tangram pick error:", error);
    return null;
  }
};
