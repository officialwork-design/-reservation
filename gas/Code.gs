function doGet(e) {
  try {
    return jsonOutput_(handleGet_(e));
  } catch (error) {
    return jsonOutput_(ng_(error.message || String(error)));
  }
}

function doPost(e) {
  try {
    return jsonOutput_(handlePost_(e));
  } catch (error) {
    return jsonOutput_(ng_(error.message || String(error)));
  }
}
