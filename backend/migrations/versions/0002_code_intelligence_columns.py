"""code intelligence columns

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa


revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('code_patches', sa.Column('verification', sa.JSON(), server_default=sa.text("'{}'"), nullable=False))
    op.add_column('code_review_findings', sa.Column('fingerprint', sa.String(length=40), server_default='', nullable=False))
    op.add_column('code_review_findings', sa.Column('merged_count', sa.Integer(), server_default='0', nullable=False))
    op.create_index(op.f('ix_code_review_findings_fingerprint'), 'code_review_findings', ['fingerprint'], unique=False)
    op.add_column('code_reviews', sa.Column('is_baseline', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column('code_reviews', sa.Column('label', sa.String(length=120), server_default='', nullable=False))
    op.add_column('generated_tests', sa.Column('patch_id', sa.Uuid(), nullable=True))


def downgrade() -> None:
    op.drop_column('generated_tests', 'patch_id')
    op.drop_column('code_reviews', 'label')
    op.drop_column('code_reviews', 'is_baseline')
    op.drop_index(op.f('ix_code_review_findings_fingerprint'), table_name='code_review_findings')
    op.drop_column('code_review_findings', 'merged_count')
    op.drop_column('code_review_findings', 'fingerprint')
    op.drop_column('code_patches', 'verification')
