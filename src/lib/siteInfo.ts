/**
 * Public texts of the site (About, Donate, progress note). Edit them here; the components only render them.
 * The account number below is shown publicly on the Donate screen (and is in the repo): edit or remove it here.
 */

export const SITE_NAME = 'FAM'
export const OWNER_NAME = 'Trần Đức Đạt'
export const BANK_NAME = 'Techcombank'
export const ACCOUNT_NUMBER = '19038496949011'
export const TRANSFER_NOTE = 'Ủng hộ FAM'
export const CONTACT_EMAIL = 'tranducdat.eng@gmail.com'

/** QR image, relative to public/ (resolved with assetUrl so it works under a sub-path). */
export const QR_IMAGE = 'images/support-qr.jpg'

export const ABOUT = {
  title: 'Giới thiệu và nguồn',
  intro:
    'FAM là viết tắt của FAMILY: một gia đình cùng học mỗi ngày. Hiện FAM luyện nghe chép chính tả tiếng Anh, và trong tương lai sẽ có thêm nhiều ngôn ngữ khác. Cái tên cũng gần với "farm": mỗi ngày cày một chút, bài nghe là hạt giống, bức tranh mở dần là mùa gặt.',
  nonProfit: 'FAM là dự án phi lợi nhuận, miễn phí, không cần đăng ký.',
  sourcesTitle: 'Nguồn',
  lessonSource: {
    text: 'Bài nghe: VOA Learning English (Voice of America), nội dung thuộc phạm vi công cộng.',
    linkLabel: 'VOA Learning English',
    url: 'https://learningenglish.voanews.com/',
  },
  pictureSource: {
    text: 'Tranh: The Metropolitan Museum of Art, Open Access (CC0).',
    linkLabel: 'Met Open Access',
    url: 'https://www.metmuseum.org/about-the-met/policies-and-documents/open-access',
  },
  creditNote: 'Lời ghi nguồn của từng bức tranh hiện ở màn hình tranh khi mở đủ 6 mảnh.',
  contactLabel: 'Email mời hợp tác:',
  donateButton: 'Ủng hộ dự án',
} as const

/** "Sao lưu tiến độ" card and the install hint on the About screen. */
export const BACKUP = {
  title: 'Sao lưu tiến độ',
  exportButton: 'Xuất tiến độ',
  importButton: 'Nhập tiến độ',
  noteVi: 'Tiến độ chỉ lưu trong trình duyệt của bạn. Xuất file để chuyển sang máy khác hoặc phòng khi xóa dữ liệu.',
  noteEn: 'Your progress is kept only in your browser. Export a file to move it to another device or in case you clear your data.',
  confirmImport: 'Nhập sẽ thay thế tiến độ hiện tại trên máy này. Tiếp tục?',
  exported: 'Đã xuất tiến độ.',
  shared: 'Đã mở bảng chia sẻ: chọn "Lưu vào Tệp" để giữ file.',
  imported: 'Đã nhập tiến độ.',
} as const

export const INSTALL_HINT = {
  android: 'Android: mở menu trình duyệt → Cài đặt ứng dụng.',
  iphone: 'iPhone: Chia sẻ → Thêm vào Màn hình chính.',
} as const

export const DONATE = {
  title: 'Ủng hộ FAM',
  vi: 'Ủng hộ FAM – FAMILY. Chào bạn! FAM là một dự án giáo dục phi lợi nhuận, làm ra để cùng nhau học tiếng Anh mỗi ngày. Mọi bài học đều miễn phí và không cần đăng ký. Nếu bạn thấy hữu ích và có điều kiện, bạn có thể ủng hộ để FAM duy trì hoạt động, thêm bài nghe mới và sau này mở rộng sang nhiều ngôn ngữ khác. Không ủng hộ cũng không sao, FAM luôn dành cho bạn.',
  en: 'Support FAM – FAMILY. Hi there! FAM is a non-profit education project that helps people practice English together every day. All lessons are free and need no sign-up. If you find it useful and you are able to, your support helps keep FAM running, add new listening lessons, and one day grow into more languages. Not donating is completely fine: FAM is always for you.',
  qrAlt: 'Mã QR ủng hộ FAM / FAM donation QR code',
  qrMissingVi: 'Mã QR sẽ được cập nhật.',
  qrMissingEn: 'The QR code will be added soon.',
  /** One line each, shown on separate lines. */
  detailsVi: [
    `Chủ tài khoản: ${OWNER_NAME}`,
    `Ngân hàng: ${BANK_NAME} - ${ACCOUNT_NUMBER}`,
    `Nội dung chuyển khoản: ${TRANSFER_NOTE}`,
  ],
  detailsEn: [
    `Account holder: ${OWNER_NAME}`,
    `Bank: ${BANK_NAME} - ${ACCOUNT_NUMBER}`,
    `Transfer note: ${TRANSFER_NOTE}`,
  ],
  copyButton: 'Sao chép nội dung chuyển khoản',
  copied: 'Đã sao chép',
  contactLabel: 'Email mời hợp tác:',
} as const

export const mailto = (email: string = CONTACT_EMAIL) => `mailto:${email}`
