const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { isDbConnected } = require('../services/db.service');

// In-memory fallback cache in case MongoDB is temporarily connecting or credentials pending
const memoryUsers = new Map();

/**
 * POST /api/signup
 * Register a new user account.
 * Expected input: { email, password }
 * Response: 201 Created on success, 400 Bad Request if user already exists or invalid input.
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate inputs
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'A valid "email" is required.'
      });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'Password is required and must be at least 6 characters.'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if MongoDB is connected
    if (isDbConnected()) {
      // 1. Check if user already exists in MongoDB
      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'UserAlreadyExists',
          message: 'User already exists with this email address.'
        });
      }

      // 2. Hash password securely
      const hashedPassword = await bcrypt.hash(password, 10);

      // 3. Create user in MongoDB
      const newUser = await User.create({
        email: normalizedEmail,
        password: hashedPassword
      });

      return res.status(201).json({
        success: true,
        message: 'User registered successfully!',
        user: {
          id: newUser._id,
          email: newUser.email,
          createdAt: newUser.createdAt
        }
      });
    } else {
      // Fallback in-memory storage (if MongoDB credentials are not yet configured)
      if (memoryUsers.has(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          error: 'UserAlreadyExists',
          message: 'User already exists with this email address.'
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const fakeId = 'mem_' + Date.now();
      const userObj = {
        id: fakeId,
        email: normalizedEmail,
        password: hashedPassword,
        createdAt: new Date().toISOString()
      };
      memoryUsers.set(normalizedEmail, userObj);

      return res.status(201).json({
        success: true,
        message: 'User registered successfully! (Stored in memory fallback - configure MongoDB Atlas username to persist permanently)',
        user: {
          id: userObj.id,
          email: userObj.email,
          createdAt: userObj.createdAt
        }
      });
    }
  } catch (err) {
    // Handle MongoDB duplicate key error (code 11000)
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'UserAlreadyExists',
        message: 'User already exists with this email address.'
      });
    }

    console.error('[Sign-Up Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to complete user registration: ' + err.message
    });
  }
});

/**
 * DELETE /api/users/clear-all
 * Clear/reset all user accounts.
 * Response: 200 OK with deleted count.
 */
router.delete('/users/clear-all', async (req, res) => {
  try {
    let deletedCount = 0;

    if (isDbConnected()) {
      const result = await User.deleteMany({});
      deletedCount = result.deletedCount || 0;
    } else {
      deletedCount = memoryUsers.size;
      memoryUsers.clear();
    }

    return res.status(200).json({
      success: true,
      message: `Successfully deleted ${deletedCount} user record(s). MongoDB collection is clean.`,
      deletedCount
    });
  } catch (err) {
    console.error('[Clear-All Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to clear user records: ' + err.message
    });
  }
});

/**
 * POST /api/login
 * Authenticate existing user with email and password from MongoDB.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'Both email and password are required.'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    let user = null;
    if (isDbConnected()) {
      user = await User.findOne({ email: normalizedEmail });
    } else {
      user = memoryUsers.get(normalizedEmail);
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'InvalidCredentials',
        message: 'Invalid email or password.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'InvalidCredentials',
        message: 'Invalid email or password.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful!',
      user: {
        id: user._id || user.id,
        email: user.email
      }
    });
  } catch (err) {
    console.error('[Login Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Login failed: ' + err.message
    });
  }
});

module.exports = router;
