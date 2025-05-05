const { User } = require("../models")
const { Op } = require("sequelize")

// Get all students
exports.getAllStudents = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Accès non autorisé" })
    }

    const students = await User.findAll({
      where: { role: "student" },
      attributes: { exclude: ["password"] },
      order: [["createdAt", "DESC"]],
    })

    res.status(200).json(students)
  } catch (error) {
    console.error("Get students error:", error)
    res.status(500).json({ message: "Erreur lors de la récupération des étudiants" })
  }
}

// Get student by ID
exports.getStudentById = async (req, res) => {
  try {
    const { id } = req.params

    // Check if user is admin or the student themselves
    if (req.user.role !== "admin" && req.user.id !== Number.parseInt(id)) {
      return res.status(403).json({ message: "Accès non autorisé" })
    }

    const student = await User.findOne({
      where: {
        id,
        role: "student",
      },
      attributes: { exclude: ["password"] },
    })

    if (!student) {
      return res.status(404).json({ message: "Étudiant non trouvé" })
    }

    res.status(200).json(student)
  } catch (error) {
    console.error("Get student error:", error)
    res.status(500).json({ message: "Erreur lors de la récupération de l'étudiant" })
  }
}

// Update student
exports.updateStudent = async (req, res) => {
  try {
    const { id } = req.params
    const { name, email, password } = req.body

    // Check if user is admin or the student themselves
    if (req.user.role !== "admin" && req.user.id !== Number.parseInt(id)) {
      return res.status(403).json({ message: "Accès non autorisé" })
    }

    const student = await User.findOne({
      where: {
        id,
        role: "student",
      },
    })

    if (!student) {
      return res.status(404).json({ message: "Étudiant non trouvé" })
    }

    // Check if email is already taken by another user
    if (email && email !== student.email) {
      const existingUser = await User.findOne({
        where: {
          email,
          id: { [Op.ne]: id },
        },
      })

      if (existingUser) {
        return res.status(400).json({ message: "Cet email est déjà utilisé" })
      }
    }

    // Update fields
    if (name) student.name = name
    if (email) student.email = email
    if (password) student.password = password

    await student.save()

    res.status(200).json({
      id: student.id,
      name: student.name,
      email: student.email,
      role: student.role,
    })
  } catch (error) {
    console.error("Update student error:", error)
    res.status(500).json({ message: "Erreur lors de la mise à jour de l'étudiant" })
  }
}

// Delete student
exports.deleteStudent = async (req, res) => {
  try {
    const { id } = req.params

    // Only admin can delete students
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Accès non autorisé" })
    }

    const student = await User.findOne({
      where: {
        id,
        role: "student",
      },
    })

    if (!student) {
      return res.status(404).json({ message: "Étudiant non trouvé" })
    }

    await student.destroy()

    res.status(200).json({ message: "Étudiant supprimé avec succès" })
  } catch (error) {
    console.error("Delete student error:", error)
    res.status(500).json({ message: "Erreur lors de la suppression de l'étudiant" })
  }
}
