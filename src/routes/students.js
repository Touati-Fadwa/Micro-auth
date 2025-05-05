const express = require("express")
const router = express.Router()
const studentsController = require("../controllers/students")
const { verifyToken } = require("../middlewares/auth")

// All routes are protected
router.use(verifyToken)

router.get("/", studentsController.getAllStudents)
router.get("/:id", studentsController.getStudentById)
router.put("/:id", studentsController.updateStudent)
router.delete("/:id", studentsController.deleteStudent)

module.exports = router
