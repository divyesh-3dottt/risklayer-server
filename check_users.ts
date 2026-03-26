import db from "./src/config/db";
async function checkUsers() {
  const users = await db.user.findMany();
  console.log("Users in DB:", users);
  process.exit(0);
}
checkUsers();
