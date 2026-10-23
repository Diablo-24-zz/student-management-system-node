import express from 'express';
import { healthCheck, listCourses, getStats } from '../controllers/courseController.js';

const router = express.Router();

router.get('/health', healthCheck);
router.get('/courses', listCourses);
router.get('/stats', getStats);

export default router;
