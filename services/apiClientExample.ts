/**
 * Example: How to Call API from Backend Server
 * Sử dụng trong be/server-mysql.ts
 */

import { apiGet, apiPost } from './apiClient';

// Ví dụ 1: Gọi API để lấy dữ liệu từ một service khác
// (hoặc từ local database thông qua API endpoint)
async function exampleGetData() {
  try {
    // Gọi GET /students
    const students = await apiGet('/students');
    console.log('Students:', students);

    // Gọi GET /drl_scores
    const scores = await apiGet('/drl_scores');
    console.log('DRL Scores:', scores);

    // Gọi GET /grading_periods
    const periods = await apiGet('/grading_periods');
    console.log('Periods:', periods);
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

// Ví dụ 2: Gọi API để tạo dữ liệu mới
async function exampleCreateData() {
  try {
    const newStudent = await apiPost('/students', {
      studentId: 'SV001',
      fullName: 'Nguyễn Văn A',
      email: 'nguyenvana@example.com',
      classId: 'CLASS001'
    });
    console.log('Created student:', newStudent);
  } catch (error) {
    console.error('Error creating student:', error);
  }
}

// Ví dụ 3: Sử dụng trong route của Express
// Thêm vào be/server-mysql.ts
/*
import { apiGet, apiPost } from './services/apiClient';

router.get('/dashboard/summary', async (req, res, next) => {
  try {
    // Gọi API để lấy dữ liệu từ nhiều nguồn
    const [students, scores, periods] = await Promise.all([
      apiGet('/students'),
      apiGet('/drl_scores'),
      apiGet('/grading_periods')
    ]);

    // Xử lý và trả về dữ liệu
    res.json({
      totalStudents: students.length,
      totalScores: scores.length,
      periods: periods
    });
  } catch (error) {
    next(error);
  }
});

router.post('/students/bulk', async (req, res, next) => {
  try {
    // Tạo nhiều sinh viên
    const students = req.body.students;
    const results = await Promise.all(
      students.map(student => apiPost('/students', student))
    );
    
    res.json({ 
      success: true, 
      created: results.length,
      data: results 
    });
  } catch (error) {
    next(error);
  }
});
*/

// Ví dụ 4: Error handling
async function exampleWithErrorHandling() {
  try {
    const data = await apiGet('/students');
    return data;
  } catch (error: any) {
    if (error.message.includes('401')) {
      console.error('Unauthorized - check API_KEY');
    } else if (error.message.includes('404')) {
      console.error('Endpoint not found');
    } else {
      console.error('API Error:', error.message);
    }
    throw error;
  }
}

// Ví dụ 5: Tận dụng cấu hình từ .env
// API_BASE sẽ tự động được lấy từ .env:
// - Production: API_BASE="https://database.kzii.site"
// - Development: API_BASE="http://localhost:3004"
// Không cần thay đổi code, chỉ sửa .env!

export {
  exampleGetData,
  exampleCreateData,
  exampleWithErrorHandling
};
