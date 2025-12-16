const StoryStyleSchema = new mongoose.Schema({
  titleFont: String,
  bodyFont: String,

  titleSize: String,        // "44px"
  subtitleSize: String,     // "18px"
  bodySize: String,         // "17px"

  titleColor: String,       // "#111111"
  subtitleColor: String,    // "#666666"
  bodyColor: String,        // "#222222"

  lineHeight: String,       // "1.75"
  paragraphSpacing: String,// "20px"
  sectionSpacing: String,  // "48px"

  textAlign: String,        // "left | center | justify"
  maxWidth: String,         // "760px"

  backgroundColor: String, // "#ffffff"
}, { _id: false });
