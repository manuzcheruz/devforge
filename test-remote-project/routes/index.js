const express = require('express');
const router = express.Router();

router.get('/', function(req, res, next) {
  res.send('Express server is running');
});

module.exports = router;
