const express = require('express');

const router = express.Router();

router.post('/invite', async (req, res) => {
  const { emails } = req.body || {};
  if (!emails || !Array.isArray(emails)) {
    return res.status(400).json({
      success: false,
      message: 'Emails array required',
    });
  }
  console.log('Invite emails received:', emails);
  return res.status(200).json({
    success: true,
    message: 'Invitations endpoint working',
  });
});

module.exports = router;
