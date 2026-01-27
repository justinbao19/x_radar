'use client';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
}

export function Pagination({ 
  currentPage, 
  totalPages, 
  onPageChange,
  totalItems,
  itemsPerPage
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible + 2) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      if (currentPage > 3) {
        pages.push('ellipsis');
      }
      
      // Show pages around current
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('ellipsis');
      }
      
      // Always show last page
      pages.push(totalPages);
    }
    
    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-5 py-4 bg-white border border-stone-200/80 rounded-2xl shadow-sm">
      {/* Info */}
      <div className="text-sm text-stone-500">
        显示 <span className="font-semibold text-stone-700">{startItem}-{endItem}</span> / 共 <span className="font-semibold text-stone-700">{totalItems}</span> 条
      </div>
      
      {/* Navigation */}
      <div className="flex items-center gap-1">
        {/* Previous */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={`p-2 rounded-xl transition-all duration-200 ${
            currentPage === 1
              ? 'text-stone-300 cursor-not-allowed'
              : 'text-stone-600 hover:bg-stone-100 hover:text-stone-800'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        {/* Page numbers */}
        {getPageNumbers().map((page, i) => (
          page === 'ellipsis' ? (
            <span key={`ellipsis-${i}`} className="px-2 text-stone-400">...</span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`min-w-[40px] h-10 px-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                currentPage === page
                  ? 'bg-gradient-to-r from-stone-800 to-stone-900 text-white shadow-md shadow-stone-900/20'
                  : 'text-stone-600 hover:bg-stone-100 border border-transparent hover:border-stone-200'
              }`}
            >
              {page}
            </button>
          )
        ))}
        
        {/* Next */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={`p-2 rounded-xl transition-all duration-200 ${
            currentPage === totalPages
              ? 'text-stone-300 cursor-not-allowed'
              : 'text-stone-600 hover:bg-stone-100 hover:text-stone-800'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
