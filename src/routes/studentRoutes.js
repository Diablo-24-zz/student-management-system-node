import express from 'express';
import {
  createStudent,
  deleteStudent,
  exportStudentsCsv,
  getStudent,
  listStudents,
  restoreStudent,
  updateStudent,
  uploadStudentPhoto
} from '../controllers/studentController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadPhoto } from '../middleware/upload.js';

const router = express.Router();

router.get('/students', listStudents);
router.get('/students/export.csv', requireAuth, exportStudentsCsv);
router.get('/students/:id', getStudent);
router.post('/students', requireAuth, createStudent);
router.post('/students/:id/photo', requireAuth, uploadPhoto.single('photo'), uploadStudentPhoto);
router.put('/students/:id', requireAuth, updateStudent);
router.delete('/students/:id', requireAuth, deleteStudent);
router.post('/students/:id/restore', requireAuth, restoreStudent);

export default router;
