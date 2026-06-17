import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:4267hj09@localhost:5432/rentlocal' });

async function main() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Listing'
    `);
    console.log('--- Columns in Listing table ---');
    console.log(res.rows);
  } catch (err) {
    console.error('Error querying columns:', err);
  } finally {
    await pool.end();
  }
}

main();
