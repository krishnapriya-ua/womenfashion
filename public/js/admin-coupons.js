$(document).ready(function() {
    // Handle form submission
    $('#coupon-form').on('submit', function(event) {
        event.preventDefault();

        const couponId = $('#coupon-id').val();
        const code = $('#code').val();
        const discount = $('#discount').val();
        const type = $('#type').val();
        const expiryDate = $('#expiryDate').val();
        const usageLimit = $('#usageLimit').val();

        const data = {
            couponId,
            code,
            discount,
            type,
            expiryDate,
            usageLimit
        };

        if (couponId) {
            // Edit coupon
            $.ajax({
                url: '/admin/coupen/edit',  // Adjust URL as needed
                method: 'PUT',
                data: data,
                success: function(response) {
                    iziToast.success({
                        title: 'Success',
                        message: 'Coupon updated successfully',
                    });
                    $('#couponModal').modal('hide');
                    location.reload();  // Reload page to reflect changes
                },
                error: function(xhr) {
                    iziToast.error({
                        title: 'Error',
                        message: 'Failed to update coupon',
                    });
                }
            });
        } else {
            // Add new coupon
            $.ajax({
                url: '/admin/coupen/add',  // Adjust URL as needed
                method: 'POST',
                data: data,
                success: function(response) {
                    iziToast.success({
                        title: 'Success',
                        message: 'Coupon added successfully',
                    });
                    $('#couponModal').modal('hide');
                    location.reload();  // Reload page to reflect changes
                },
                error: function(xhr) {
                    iziToast.error({
                        title: 'Error',
                        message: 'Failed to add coupon',
                    });
                }
            });
        }
    });

    // Open modal for editing
    window.editCoupon = function(id, code, discount, type, expiryDate, usageLimit) {
        $('#coupon-id').val(id);
        $('#code').val(code);
        $('#discount').val(discount);
        $('#type').val(type);
        $('#expiryDate').val(expiryDate);
        $('#usageLimit').val(usageLimit);
        $('#couponModalLabel').text('Edit Coupon');
        $('#couponModal').modal('show');
    };

    // Handle delete coupon
    window.deleteCoupon = function(id) {
        if (confirm('Are you sure you want to delete this coupon?')) {
            $.ajax({
                url: '/admin/coupen/delete',  // Adjust URL as needed
                method: 'DELETE',
                data: { couponId: id },
                success: function(response) {
                    iziToast.success({
                        title: 'Success',
                        message: 'Coupon deleted successfully',
                    });
                    location.reload();  // Reload page to reflect changes
                },
                error: function(xhr) {
                    iziToast.error({
                        title: 'Error',
                        message: 'Failed to delete coupon',
                    });
                }
            });
        }
    };
});
