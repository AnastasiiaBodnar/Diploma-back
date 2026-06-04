import 'dotenv/config';
import app from './src/app.js';
import { startCron } from './src/services/cronService.js';

const PORT = process.env.PORT || 5000;

startCron();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});