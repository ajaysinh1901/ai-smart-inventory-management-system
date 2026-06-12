'use strict';
const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/MERNDB').then(async () => {
  const users = await mongoose.connection.db.collection('users').find({}).project({email:1,role:1,name:1,_id:0}).toArray();
  console.log('All users:', JSON.stringify(users, null, 2));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
